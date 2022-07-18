#!/usr/bin/env python

"""Usage:

 ./make_status.py stackfile

Aim:

Create the status data for CSC 2.1. At the moment this does not match
the current state, as we haven't worked through this part of the
process yet.

"""

from pathlib import Path
import json
import sys
import time


def doit(stackfile):

    infile = Path(stackfile)
    if not infile.is_file():
        raise OSError(f"stackfile={stackfile} does not exist")

    state = {"stacks": {}, "completed": {}}
    for l in infile.read_text().split("\n"):
        if l == "":
            continue

        toks = l.split()
        assert len(toks) == 2, l

        stack = toks[0]
        state["stacks"][stack] = False

    # For now use UTC
    lmod = time.gmtime()
    txt = time.strftime("%Y-%m-%d %H:%M", lmod)
    state["lastupdate"] = txt
    state["lastupdate"] = txt

    print(json.dumps(state))


if __name__ == "__main__":

    if len(sys.argv) != 2:
        sys.stderr.write(f"Usage: {sys.argv[0]} stackfile\n")
        sys.exit(1)

    doit(sys.argv[1])
