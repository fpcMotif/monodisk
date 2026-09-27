# /// script
# dependencies = ["pyte", "pillow"]
# ///
"""Exercise the compiled terminal app in a PTY, using disposable data only."""

import fcntl
import os
import pty
import select
import struct
import subprocess
import tempfile
import termios
import time
from pathlib import Path

import pyte
from PIL import Image, ImageDraw, ImageFont


def await_text(master, stream, screen, needle):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if select.select([master], [], [], 0.1)[0]:
            stream.feed(os.read(master, 262144).decode("utf-8", errors="replace"))
        if needle in "\n".join(screen.display):
            return
    raise AssertionError(f"Missing {needle!r}:\n" + "\n".join(screen.display))


def capture(screen, destination):
    font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 15)
    canvas = Image.new("RGB", (1120, 610), "#121212")
    draw = ImageDraw.Draw(canvas)
    for index, line in enumerate(screen.display):
        draw.text((16, 12 + index * 19), line, fill="#dedede", font=font)
    canvas.save(destination)


def main():
    artifacts = Path("artifacts")
    artifacts.mkdir(exist_ok=True)
    executable = str(Path("dist/monodisk").resolve())
    with tempfile.TemporaryDirectory(prefix="monodisk-ui-") as temp:
        base = Path(temp)
        root = base / "fixture"
        home = base / "home"
        (root / "Projects").mkdir(parents=True)
        (home / ".Trash").mkdir(parents=True)
        (root / "Projects" / "archive.bin").write_bytes(b"x" * 4_000_000)
        (root / "Movies.mov").write_bytes(b"x" * 2_000_000)
        (root / "Downloads.zip").write_bytes(b"x" * 1_000_000)
        (root / "Notes.md").write_text("notes")
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 120, 0, 0))
        original = termios.tcgetattr(slave)
        screen = pyte.Screen(120, 30)
        stream = pyte.Stream(screen)
        child = subprocess.Popen(
            [executable, str(root)],
            stdin=slave,
            stdout=slave,
            stderr=slave,
            env={**os.environ, "HOME": str(home), "TERM": "xterm-256color"},
        )
        try:
            await_text(master, stream, screen, "Scanned")
            capture(screen, artifacts / "terminal.png")
            os.write(master, b"l")
            await_text(master, stream, screen, "fixture/Projects")
            os.write(master, b"h")
            await_text(master, stream, screen, "4 entries")
            os.write(master, b"s")
            await_text(master, stream, screen, "sort: name")
            os.write(master, b" a")
            await_text(master, stream, screen, "marked 4")
            os.write(master, b"d")
            await_text(master, stream, screen, "to Trash?")
            os.write(master, b"n")
            await_text(master, stream, screen, "Cleanup cancelled")
            assert len(list(root.iterdir())) == 4
            os.write(master, b"dY")
            await_text(master, stream, screen, "Trash: 4 moved, 0 failed")
            assert not list(root.iterdir())
            assert len(list((home / ".Trash").iterdir())) == 4
            screen.resize(20, 60)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 20, 60, 0, 0))
            await_text(master, stream, screen, "empty directory")
            os.write(master, b"q")
            deadline = time.monotonic() + 5
            while child.poll() is None and time.monotonic() < deadline:
                if select.select([master], [], [], 0.1)[0]:
                    os.read(master, 262144)
            assert child.poll() == 0
            assert termios.tcgetattr(slave) == original
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=2)
            os.close(master)
            os.close(slave)
    print(
        "PTY passed: compiled frame, navigation, sorting, selection, cancel, bulk Trash, resize, terminal restoration"
    )


if __name__ == "__main__":
    main()
