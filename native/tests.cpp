#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>

extern "C" int md_start(const uint8_t*, size_t, uint32_t);
extern "C" double md_status(uint32_t);
extern "C" void md_wait();
extern "C" void md_stop();
extern "C" int md_trash(uint32_t);
using Row = void(*)(uint32_t, const char*, size_t, double, double, double, uint32_t, uint32_t, void*);
extern "C" void md_children(uint32_t, Row, void*);
struct Entry { uint32_t id; std::string name; double allocated, logical, files; bool dir, complete; };
static void row(uint32_t id, const char* name, size_t length, double allocated, double logical, double files, uint32_t dir, uint32_t complete, void* ctx) {
  static_cast<std::vector<Entry>*>(ctx)->push_back({id, std::string(name, length), allocated, logical, files, dir != 0, complete != 0});
}
static std::vector<Entry> children(uint32_t id) { std::vector<Entry> result; md_children(id, row, &result); return result; }
static Entry find(uint32_t id, const std::string& name) {
  for (const auto& entry : children(id)) if (entry.name == name) return entry;
  fprintf(stderr, "Missing fixture entry: %s\n", name.c_str()); abort();
}
static void scan(const std::string& path, uint32_t threads = 4) {
  assert(md_start(reinterpret_cast<const uint8_t*>(path.data()), path.size(), threads) == 0);
  md_wait(); assert(md_status(0) == 1);
}
int main() {
  char pattern[] = "/tmp/monodisk-test-XXXXXX";
  char* tmp = mkdtemp(pattern); assert(tmp);
  std::string base = tmp, root = base + "/root", home = base + "/home";
  namespace fs = std::filesystem;
  fs::create_directories(root + "/nested/empty"); fs::create_directories(home + "/.Trash");
  setenv("HOME", home.c_str(), 1);
  std::ofstream(root + "/file") << std::string(8192, 'x');
  fs::create_hard_link(root + "/file", root + "/nested/link");
  fs::create_directory_symlink(root, root + "/loop");
  std::ofstream(root + "/escape\033[31m") << "x";
  int sparse = open((root + "/sparse").c_str(), O_CREAT | O_WRONLY, 0600);
  assert(sparse >= 0); assert(ftruncate(sparse, 1 << 24) == 0); close(sparse);
  scan(root);
  assert(md_status(1) == 8 && md_status(6) == 5 && md_status(2) == 0);
  assert(find(0, "file").logical == 8192);
  assert(find(find(0, "nested").id, "link").logical == 0);
  assert(!find(0, "loop").dir);
  assert(find(0, "sparse").logical == (1 << 24));
  assert(find(0, "sparse").allocated < (1 << 24));
  double expected = md_status(4);
  scan(root, 1); assert(md_status(4) == expected);
  assert(md_trash(0) == EINVAL);
  auto old = find(0, "file");
  fs::rename(root + "/file", root + "/original"); std::ofstream(root + "/file") << "replacement";
  assert(md_trash(old.id) == ESTALE); assert(fs::exists(root + "/file"));
  auto nested = find(0, "nested"); auto link = find(nested.id, "link");
  fs::rename(root + "/nested", root + "/saved"); fs::create_directory_symlink(root + "/saved", root + "/nested");
  assert(md_trash(link.id) != 0); assert(fs::exists(root + "/saved/link"));
  scan(root);
  auto removable = find(0, "escape\033[31m");
  assert(md_trash(removable.id) == 0); assert(!fs::exists(root + "/escape\033[31m"));
  auto folder = find(0, "saved"); auto descendant = find(folder.id, "link");
  assert(md_trash(folder.id) == 0); assert(md_trash(descendant.id) == EALREADY);
  assert(std::distance(fs::directory_iterator(home + "/.Trash"), fs::directory_iterator{}) == 2);
  fs::create_directory(root + "/denied"); chmod((root + "/denied").c_str(), 0000);
  scan(root); assert(md_status(2) >= 1); assert(!find(0, "denied").complete);
  assert(md_trash(find(0, "denied").id) == EPERM);
  chmod((root + "/denied").c_str(), 0700);
  std::string deep = root;
  for (int i = 0; i < 96; ++i) { deep += "/d"; fs::create_directory(deep); }
  scan(root); assert(md_status(2) == 0);
  md_stop(); fs::remove_all(base);
  puts("native tests passed: sizes, sparse, hardlinks, symlinks, threads, identity replacement, ancestor replacement, Trash, permissions, depth");
}
