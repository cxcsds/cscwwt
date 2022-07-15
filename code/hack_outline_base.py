#!/usr/bin/env python

"""

Usage:

  ./hack_outline_base.py infile

Aim:

Convert a CSC 2.0 ere outline file to just a list of polygons
per stack, to match the CSC 2.1 era approach.

I must have the code I used to create the original files but
I don't know where it is, so I am just working backwards
instead.

It would be easier to load in the data as JSON and just
extract what I need but I want to keep the number of dp
used here.

"""

import sys


def process(infile):

    with open(infile) as fh:
        mode = "start1"
        stack = None
        sep = ""
        print("{")
        for l in fh.readlines():
            l = l.strip()
            if mode == "start1":
                assert l == "var outlines = {", l
                mode = "start2"
                continue

            if mode == "start2":
                assert l == '"stacks": [', l
                mode = "stack"
                continue

            if mode == "stack":

                if l == "]};":
                    mode = "fini"
                    continue

                idx = l.find('"stackid": ')
                assert idx > 0, (l, idx)
                l = l[idx + 12:]
                idx = l.find('"')
                assert idx > 0, (l, idx)
                stack = l[:idx]
                assert stack.startswith("acisfJ") or stack.startswith("hrcfJ"), stack
                print(f'{sep}"{stack}": [')
                mode = "skip"
                sep = ","
                continue

            if mode == "skip":
                if l == '"polygons": [':
                    mode = "polygons"

                continue

            if mode == "polygons":
                if l.startswith("[") or l.startswith(",[") or l == "]":
                    print(l)
                    continue

                if l == "]}":
                    print("]")
                    mode = "stack"
                    continue

                assert False, l

            assert False, l

        assert mode == "fini", mode
        print("}")


if __name__ == "__main__":

    if len(sys.argv) != 2:
        sys.stderr.write(f"Usage: {sys.argv[0]} infile\n")
        sys.exit(1)

    process(sys.argv[1])
