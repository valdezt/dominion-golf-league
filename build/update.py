#!/usr/bin/env python3
"""Rebuild site/data.json from data/scores.csv (local convenience wrapper).

Data entry lives elsewhere:
  - add_week.py     append the current week (the usual weekly step)
  - import_paste.py bulk import / add several players from a full sheet paste
Both of those already rebuild automatically; run this when you've hand-edited
data/scores.csv or data/course.csv and just want to regenerate the site.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.exit(subprocess.run([sys.executable, os.path.join(HERE, "build.py")]).returncode)
