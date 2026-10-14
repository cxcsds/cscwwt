#!/usr/bin/env python

"""
Usage:

  ./identify_stacks_names.py directory

Aim:

We want to identify stacks with their obi names. If follows
identify_stacks_obis.py

The output is written to stdout, expected to be saved to

  wwt21_names.js

"""

from pathlib import Path
import sys

import stackdata


def process(indir):
    """Read in the stack data."""

    stacks = stackdata.find_stack_obis(indir)
    targets = stackdata.read_cxc_targetnames()

    # Write out (really should be JSON but doint it this way for now).
    #
    print("var stack_name_map = {")
    spacer = ""
    for stack in sorted(stacks):
        obsids = set(obi[0] for obi in stacks[stack])
        names = set(f'"{targets[obsid]}"' for obsid in obsids)
        print(f'{spacer}"{stack}": [{",".join(names)}]')
        spacer = ","

    print("};")


if __name__ == "__main__":

    if len(sys.argv) != 2:
        sys.stderr.write(f"Usage: {sys.argv[0]} directory\n")
        sys.exit(1)

    process(Path(sys.argv[1]))
