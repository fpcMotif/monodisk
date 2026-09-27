#include <sys/attr.h>
#include <sys/stat.h>
#include <sys/mount.h>
#include <sys/ioctl.h>
#include <sys/types.h>
#include <sys/vnode.h>
#include <fcntl.h>
#include <unistd.h>
#include <pthread.h>
#include <termios.h>
#include <poll.h>
#include <signal.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <mutex>
#include <memory_resource>
#include <memory>
#include <span>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <vector>

#ifdef MD_PROFILE
struct Profile {
  uint64_t path = 0, open = 0, bulk = 0, parse = 0, close = 0;
  uint64_t directories = 0, calls = 0;
};
static thread_local Profile profile;
static std::mutex profile_lock;
static uint64_t ticks() { return clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW); }
#define TIMED(field, expression) do { auto before = ticks(); expression; profile.field += ticks() - before; } while (false)
#else
#define TIMED(field, expression) do { expression; } while (false)
#endif

// Worker arenas retain packed names and child arrays until the next scan.
struct Node {
  std::string_view name;
  Node* kids = nullptr;
  uint32_t count = 0;
  Node* parent = nullptr;
  uint64_t allocated = 0, logical = 0, inode = 0, files = 0;
  uint32_t device = 0, id = 0, links = 1, flags = 0;
  bool directory = false, complete = true, moved = false;
};
static Node root;
static std::vector<std::unique_ptr<std::pmr::monotonic_buffer_resource>> arenas;
static std::span<Node> children_of(Node* n) { return {n->kids, n->count}; }
static std::vector<Node*> nodes;
static std::deque<Node*> queue;
static std::mutex queue_lock;
static std::condition_variable ready;
static size_t busy_workers = 0;
static bool exhausted = false;
static std::atomic<unsigned> waiting_workers{0};
static std::atomic<uint64_t> entries{0}, errors{0};
static std::atomic<bool> done{false}, cancelled{false};
static std::thread coordinator;
static std::string root_path;
static int root_fd = -1;
static double elapsed = 0;
static std::atomic<int> failure{0};

static void relative_path(Node* n, std::string& path) {
  thread_local std::vector<std::string_view> parts;
  parts.clear(); path.clear();
  while (n->parent) { parts.push_back(n->name); n = n->parent; }
  for (auto it = parts.rbegin(); it != parts.rend(); ++it) {
    if (!path.empty()) path += '/';
    path += *it;
  }
  if (path.empty()) path = ".";
}

static bool path_before(Node* a, Node* b) {
  std::vector<std::string_view> left, right;
  for (; a->parent; a = a->parent) left.push_back(a->name);
  for (; b->parent; b = b->parent) right.push_back(b->name);
  return std::lexicographical_compare(left.rbegin(), left.rend(), right.rbegin(), right.rend());
}
static void incomplete(Node* n) { n->complete = false; ++errors; }

// Kernel records are packed to four-byte alignment; memcpy avoids unaligned loads.
struct Record {
  const char* bytes; size_t length; size_t offset = 4; bool valid = true;
  template<class T> T take() {
    T value{};
    if (offset > length || sizeof(T) > length - offset) { valid = false; return value; }
    memcpy(&value, bytes + offset, sizeof(T)); offset += sizeof(T); return value;
  }
};
static bool parse(const char* bytes, size_t length, Node& out, std::pmr::monotonic_buffer_resource& arena, uint64_t parent_inode) {
  Record r{bytes, length};
  auto attrs = r.take<attribute_set_t>();
  if ((attrs.commonattr & ATTR_CMN_ERROR) && r.take<uint32_t>()) return false;
  if (!(attrs.commonattr & ATTR_CMN_NAME)) return false;
  size_t ref_offset = r.offset;
  auto ref = r.take<attrreference_t>();
  int64_t start = static_cast<int64_t>(ref_offset) + ref.attr_dataoffset;
  if (start < 0 || static_cast<uint64_t>(start) >= length || !ref.attr_length ||
      ref.attr_length > length - static_cast<size_t>(start)) return false;
  const char* name = bytes + start;
  if (name[ref.attr_length - 1] || memchr(name, 0, ref.attr_length - 1) ||
      memchr(name, '/', ref.attr_length - 1)) return false;
  char* stored = static_cast<char*>(arena.allocate(ref.attr_length, 1));
  memcpy(stored, name, ref.attr_length);
  out.name = std::string_view(stored, ref.attr_length - 1);
  if (out.name.empty() || out.name == "." || out.name == "..") return false;
  constexpr uint32_t required = ATTR_CMN_DEVID | ATTR_CMN_OBJTYPE | ATTR_CMN_FLAGS | ATTR_CMN_FILEID;
  if ((attrs.commonattr & required) != required) return false;
  out.device = r.take<uint32_t>();
  out.directory = r.take<uint32_t>() == VDIR;
  if (!out.directory && out.device != root.device) return false;
  out.flags = r.take<uint32_t>();
  out.inode = r.take<uint64_t>();
  if ((attrs.commonattr & ATTR_CMN_PARENTID) && r.take<uint64_t>() != parent_inode) return false;
  if (attrs.dirattr & ATTR_DIR_MOUNTSTATUS) {
    if (r.take<uint32_t>() & DIR_MNTSTATUS_MNTPOINT) out.complete = false;
  }
  if (attrs.fileattr & ATTR_FILE_LINKCOUNT) out.links = r.take<uint32_t>();
  if (attrs.fileattr & ATTR_FILE_TOTALSIZE) out.logical = std::max<int64_t>(0, r.take<int64_t>());
  if (attrs.fileattr & ATTR_FILE_ALLOCSIZE) out.allocated = std::max<int64_t>(0, r.take<int64_t>());
  if (!out.directory && (attrs.fileattr & (ATTR_FILE_TOTALSIZE | ATTR_FILE_ALLOCSIZE)) !=
      (ATTR_FILE_TOTALSIZE | ATTR_FILE_ALLOCSIZE)) return false;
  if (out.directory && (out.flags & SF_DATALESS)) out.complete = false;
  if (out.directory && out.device != root.device) out.complete = false;
  out.files = out.directory ? 0 : 1;
  return r.valid;
}

static void read_directory(Node* n, std::vector<char>& buffer, std::vector<Node>& scratch, std::pmr::monotonic_buffer_resource& arena, std::string& path) {
  scratch.clear();
  TIMED(path, relative_path(n, path));
  int fd;
  TIMED(open, fd = openat(root_fd, path.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC));
#ifdef MD_PROFILE
  ++profile.directories;
#endif
  if (fd < 0) { incomplete(n); return; }
  // Own the descriptor through parsing and allocation failures.
  struct Close { int fd; ~Close() { if (fd >= 0) close(fd); } } opened{fd};
  bool identity_verified = false;
  struct attrlist attrs{};
  attrs.bitmapcount = ATTR_BIT_MAP_COUNT;
  attrs.commonattr = ATTR_CMN_RETURNED_ATTRS | ATTR_CMN_ERROR | ATTR_CMN_NAME | ATTR_CMN_DEVID |
                     ATTR_CMN_OBJTYPE | ATTR_CMN_FLAGS | ATTR_CMN_FILEID | ATTR_CMN_PARENTID;
  attrs.dirattr = ATTR_DIR_MOUNTSTATUS;
  attrs.fileattr = ATTR_FILE_LINKCOUNT | ATTR_FILE_TOTALSIZE | ATTR_FILE_ALLOCSIZE;
  for (;;) {
    if (cancelled) { n->complete = false; break; }
    int count;
    TIMED(bulk, count = getattrlistbulk(fd, &attrs, buffer.data(), buffer.size(), 0));
#ifdef MD_PROFILE
    ++profile.calls;
    auto parse_start = ticks();
#endif
    if (count <= 0) { if (count < 0) incomplete(n); break; }
    size_t offset = 0;
    for (int i = 0; i < count; ++i) {
      uint32_t length = 0;
      if (offset + 4 > buffer.size()) { incomplete(n); break; }
      memcpy(&length, buffer.data() + offset, 4);
      if (length < 24 || length > buffer.size() - offset) { incomplete(n); break; }
      attribute_set_t returned{};
      memcpy(&returned, buffer.data() + offset + 4, sizeof(returned));
      // Parent identity rides with bulk metadata on APFS. Other filesystems use fstat once.
      if (!(returned.commonattr & ATTR_CMN_PARENTID) && !identity_verified) {
        struct stat st{};
        if (fstat(fd, &st) || st.st_ino != n->inode || uint32_t(st.st_dev) != n->device) {
          incomplete(n); return;
        }
        identity_verified = true;
      }
      Node child;
      if (parse(buffer.data() + offset, length, child, arena, n->inode)) {
        child.parent = n;
        if (!child.complete) ++errors;
        scratch.push_back(child);
      } else incomplete(n);
      offset += length;
    }
#ifdef MD_PROFILE
    profile.parse += ticks() - parse_start;
#endif
  }
  TIMED(close, close(fd)); opened.fd = -1;
  if (!scratch.empty()) {
    n->kids = static_cast<Node*>(arena.allocate(scratch.size() * sizeof(Node), alignof(Node)));
    memcpy(n->kids, scratch.data(), scratch.size() * sizeof(Node));
    n->count = static_cast<uint32_t>(scratch.size());
  }
  entries.fetch_add(n->count, std::memory_order_relaxed);
}

static void worker(std::pmr::monotonic_buffer_resource* arena) {
  pthread_set_qos_class_self_np(QOS_CLASS_USER_INITIATED, 0);
  std::vector<char> buffer(256 * 1024);
  std::vector<Node> scratch;
  std::vector<Node*> local;
  std::string path;
  for (;;) {
    {
      std::unique_lock guard(queue_lock);
      ++waiting_workers;
      ready.wait(guard, [] { return !queue.empty() || exhausted; });
      --waiting_workers;
      if (exhausted) {
#ifdef MD_PROFILE
        std::lock_guard output(profile_lock);
        fprintf(stderr, "profile directories=%llu calls=%llu path_ms=%.3f open_ms=%.3f bulk_ms=%.3f parse_ms=%.3f close_ms=%.3f node_bytes=%zu\n",
          (unsigned long long)profile.directories, (unsigned long long)profile.calls,
          profile.path / 1e6, profile.open / 1e6, profile.bulk / 1e6, profile.parse / 1e6, profile.close / 1e6, sizeof(Node));
#endif
        return;
      }
      local.push_back(queue.back()); queue.pop_back(); ++busy_workers;
    }
    while (!local.empty()) {
      Node* n = local.back(); local.pop_back();
      try { if (!cancelled) read_directory(n, buffer, scratch, *arena, path); }
      catch (...) { cancelled = true; failure = ENOMEM; }
      if (!cancelled) for (auto& child : children_of(n)) {
        if (child.directory && child.complete) local.push_back(&child);
      }
      // Keep depth-first work local. Donate only when another worker needs work.
      if (waiting_workers.load(std::memory_order_relaxed) && local.size() > 1) {
        std::lock_guard guard(queue_lock);
        if (queue.empty()) {
          size_t share = local.size() / 2;
          while (share--) { queue.push_back(local.back()); local.pop_back(); }
          ready.notify_all();
        }
      }
    }
    {
      std::lock_guard guard(queue_lock);
      --busy_workers;
      if (!busy_workers && queue.empty()) { exhausted = true; ready.notify_all(); }
    }
  }
}

struct LinkKey {
  uint64_t inode; uint32_t device;
  bool operator==(const LinkKey&) const = default;
};
struct LinkHash { size_t operator()(const LinkKey& k) const { return k.inode ^ (uint64_t(k.device) << 32); } };
static void finish() {
  std::unordered_map<LinkKey, Node*, LinkHash> links;
  nodes.push_back(&root);
  for (size_t i = 0; i < nodes.size(); ++i) {
    Node* n = nodes[i]; n->id = static_cast<uint32_t>(i);
    for (auto& child : children_of(n)) nodes.push_back(&child);
    if (!n->directory && n->links > 1) {
      auto [it, inserted] = links.emplace(LinkKey{n->inode, n->device}, n);
      if (!inserted) {
        Node* loser = n;
        if (path_before(n, it->second)) { loser = it->second; it->second = n; }
        loser->allocated = 0; loser->logical = 0;
      }
    }
  }
  for (size_t i = nodes.size(); i-- > 1;) {
    Node* n = nodes[i]; Node* p = n->parent;
    p->allocated += n->allocated; p->logical += n->logical; p->files += n->files;
    p->complete = p->complete && n->complete;
  }
}

extern "C" int md_start(const uint8_t* input, size_t length, uint32_t threads) {
  if (coordinator.joinable()) coordinator.join();
  if (!length || memchr(input, 0, length)) return EINVAL;
  std::string path(reinterpret_cast<const char*>(input), length);
  char* canonical = realpath(path.c_str(), nullptr);
  if (!canonical) return errno;
  root_path = canonical; free(canonical);
  struct stat initial{};
  if (lstat(root_path.c_str(), &initial)) return errno;
  if (initial.st_flags & SF_DATALESS) return ENODATA;
  if (root_fd >= 0) close(root_fd);
  root_fd = open(root_path.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (root_fd < 0) return errno;
  struct stat st{};
  if (fstat(root_fd, &st)) return errno;
  if (st.st_flags & SF_DATALESS) return ENODATA;
  root = Node{}; root.name = root_path; root.directory = true;
  arenas.clear();
  root.inode = st.st_ino; root.device = st.st_dev;
  nodes.clear(); queue.clear(); queue.push_back(&root); busy_workers = 0; exhausted = false; waiting_workers = 0;
  entries = 1; errors = 0; done = false; cancelled = false; failure = 0;
  unsigned count = threads ? threads : std::min(8u, std::thread::hardware_concurrency());
  count = std::clamp(count, 1u, 32u);
  coordinator = std::thread([count] {
    auto start = std::chrono::steady_clock::now();
    try {
      std::vector<std::thread> workers;
      try {
        for (unsigned i = 0; i < count; ++i) {
          arenas.push_back(std::make_unique<std::pmr::monotonic_buffer_resource>(256 * 1024));
          workers.emplace_back(worker, arenas.back().get());
        }
      }
      catch (...) { cancelled = true; failure = EAGAIN; }
      for (auto& t : workers) t.join();
#ifdef MD_PROFILE
      auto finish_start = std::chrono::steady_clock::now();
#endif
      finish();
#ifdef MD_PROFILE
      fprintf(stderr, "profile finish_ms=%.3f\n", std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - finish_start).count());
#endif
    } catch (...) { failure = ENOMEM; }
    elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
    done = true;
  });
  return 0;
}
extern "C" double md_status(uint32_t field) {
  if (field == 0) return done ? (failure ? -failure.load() : 1) : 0;
  if (field == 1) return static_cast<double>(entries.load());
  if (field == 2) return static_cast<double>(errors.load());
  if (!done) return 0;
  if (field == 3) return elapsed;
  if (field == 4) return static_cast<double>(root.allocated);
  if (field == 5) return static_cast<double>(root.logical);
  return static_cast<double>(root.files);
}
extern "C" void md_stop() {
  cancelled = true;
  if (coordinator.joinable()) coordinator.join();
}
extern "C" void md_wait() {
  if (coordinator.joinable()) coordinator.join();
}
using Row = void(*)(uint32_t, const char*, size_t, double, double, double, uint32_t, uint32_t, void*);
extern "C" void md_children(uint32_t id, Row row, void* context) {
  if (!done || id >= nodes.size()) return;
  for (auto& n : children_of(nodes[id])) if (!n.moved)
    row(n.id, n.name.data(), n.name.size(), double(n.allocated), double(n.logical), double(n.files),
        n.directory ? 1 : 0, n.complete ? 1 : 0, context);
}
extern "C" uint32_t md_parent(uint32_t id) {
  if (id >= nodes.size() || !nodes[id]->parent) return 0;
  return nodes[id]->parent->id;
}

// Open every ancestor relative to the captured root without following symlinks.
static int parent_fd(Node* node) {
  std::vector<Node*> ancestors;
  for (Node* p = node->parent; p && p->parent; p = p->parent) ancestors.push_back(p);
  int fd = dup(root_fd);
  for (auto it = ancestors.rbegin(); it != ancestors.rend() && fd >= 0; ++it) {
    int next = openat(fd, (*it)->name.data(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    close(fd); fd = next;
    struct stat st{};
    if (fd >= 0 && (fstat(fd, &st) || st.st_ino != (*it)->inode || uint32_t(st.st_dev) != (*it)->device)) {
      close(fd); errno = ESTALE; return -1;
    }
  }
  return fd;
}
extern "C" int md_trash(uint32_t id) {
  if (!done || id == 0 || id >= nodes.size()) return EINVAL;
  Node* n = nodes[id];
  for (Node* p = n; p; p = p->parent) if (p->moved) return EALREADY;
  if (!n->complete || (n->flags & SF_DATALESS)) return EPERM;
  int source = parent_fd(n);
  if (source < 0) return errno;
  struct stat st{};
  if (fstatat(source, n->name.data(), &st, AT_SYMLINK_NOFOLLOW) ||
      st.st_ino != n->inode || uint32_t(st.st_dev) != n->device) {
    close(source); return ESTALE;
  }
  const char* home = getenv("HOME");
  if (!home) { close(source); return ENOENT; }
  std::string trash = std::string(home) + "/.Trash";
  int target = open(trash.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (target < 0) { int e = errno; close(source); return e; }
  struct stat trash_stat{};
  if (fstat(target, &trash_stat) || trash_stat.st_uid != getuid()) { close(source); close(target); return EPERM; }
  char prefix[64]; snprintf(prefix, sizeof(prefix), "monodisk-%u-%08x-", id, arc4random());
  std::string destination(prefix); destination += n->name;
  if (destination.size() > NAME_MAX) destination.resize(NAME_MAX);
  int result = renameatx_np(source, n->name.data(), target, destination.c_str(), RENAME_EXCL);
  int error = result ? errno : 0;
  if (!result) {
    struct stat moved{};
    if (fstatat(target, destination.c_str(), &moved, AT_SYMLINK_NOFOLLOW) ||
        moved.st_ino != n->inode || uint32_t(moved.st_dev) != n->device) {
      // A concurrent replacement is put back only if the source name remains vacant.
      if (renameatx_np(target, destination.c_str(), source, n->name.data(), RENAME_EXCL)) error = EBUSY;
      else error = ESTALE;
    } else n->moved = true;
  }
  close(source); close(target);
  return error;
}

static termios saved;
static bool raw = false;
static volatile sig_atomic_t interrupted = 0;
static void on_signal(int) { interrupted = 1; }
extern "C" void md_terminal(uint32_t enable) {
  if (enable && !raw && isatty(0) && !tcgetattr(0, &saved)) {
    auto state = saved; cfmakeraw(&state); state.c_oflag |= OPOST;
    tcsetattr(0, TCSAFLUSH, &state); raw = true;
    signal(SIGINT, on_signal); signal(SIGTERM, on_signal); signal(SIGHUP, on_signal);
    fputs("\033[?1049h\033[?25l", stdout); fflush(stdout);
  } else if (!enable && raw) {
    tcsetattr(0, TCSAFLUSH, &saved); raw = false;
    fputs("\033[?25h\033[?1049l", stdout); fflush(stdout);
  }
}
extern "C" uint32_t md_dimension(uint32_t axis) {
  winsize size{};
  if (ioctl(1, TIOCGWINSZ, &size)) return axis ? 24 : 80;
  return axis ? size.ws_row : size.ws_col;
}
extern "C" int md_key(uint32_t timeout) {
  if (interrupted) return 3;
  if (!isatty(0)) { std::this_thread::sleep_for(std::chrono::milliseconds(timeout)); return -1; }
  pollfd fd{0, POLLIN, 0};
  if (poll(&fd, 1, static_cast<int>(timeout)) <= 0) return -1;
  unsigned char c;
  if (read(0, &c, 1) != 1) return 3;
  if (c == 27) {
    if (poll(&fd, 1, 25) > 0 && read(0, &c, 1) == 1 && c == '[' &&
        poll(&fd, 1, 25) > 0 && read(0, &c, 1) == 1) {
      if (c == 'A') return 1001; if (c == 'B') return 1002;
      if (c == 'C') return 1003; if (c == 'D') return 1004;
    }
    return 27;
  }
  return c;
}
