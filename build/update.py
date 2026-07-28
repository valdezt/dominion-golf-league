#!/usr/bin/env python3
"""One-shot weekly update: import the paste, then rebuild the site."""
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))

for step in ("import_paste.py", "build.py"):
    print(f"\n=== {step} ===")
    r = subprocess.run([sys.executable, os.path.join(HERE, step)])
    if r.returncode != 0:
        sys.exit(r.returncode)
print("\nDone. Review site/ locally, then commit & push to publish.")
