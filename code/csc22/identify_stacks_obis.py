#!/usr/bin/env python

"""
Usage:

  ./identify_stacks_obis.py stackfovdir outfile

Aim:

Provide a mapping from stack name to a list of obsid+obis
in JSON.

The output is written to outfile, expected to be called

  wwt22_obis.js

Requires
--------

The stackfovdir contains all the FOV files for the stacks.
This also gives us the OBSID values but not the OBI values.



"""

from pathlib import Path
import sys

import pycrates


def read_fov_for_obsids(fovpath: Path) -> tuple[str, list[str]]:
    """Return the stack identifier and the obsids in the stack.

    THe input comes from the stack file.

    """

    cr = pycrates.read_file(str(fovpath) + "[#row=1]")
    if cr.get_nrows() == 0:
        raise OSError(str(fovfile))

    stack = cr.get_key_value("STACK_ID")

    # The obsids are probably already stored in ascending order
    # and in 5-character form, but make sure of this.
    #
    obsids: list[int] = []
    obsval = cr.get_key_value("OBS_ID")
    if obsval == "LIST":
        n = 1
        while obsval := cr.get_key_value(f"OBSID{n:03d}"):
            obsids.append(int(obsval))
            n += 1

    else:
        obsids.append(int(obsval))

    return stack, [f"{o:05d}" for o in obsids]


def process(indir: Path,
            outfile: Path
            ) -> None:
    """Read in the stack data."""

    if not indir.is_dir():
        raise OSError(f"indir={indir} is not a directory")

    if outfile.exists():
        raise OSError(f"outfile={outfile} exists")

    stacks = {}
    for infov in indir.glob("*_fov3.fits*"):
        stack, obsids = read_fov_for_obsids(infov)
        if stack in stacks:
            raise OSError(f"Multiple stack {stack} {infov}")

        stacks[stack] = obsids
        print(stack, len(obsids))

    if len(stacks) == 0:
        raise OSError("No stacks found")

    def nice(obi):
        return f'"{obi[0]:05d}_{obi[1]:03d}"'

    # Write out (really should be JSON but doing it this way for now).
    #
    with outfile.open(mode='wt') as ofh:
        ofh.write("var obi_map = {\n")
        spacer = ""
        for stack in sorted(stacks):
            # obis = [nice(obi) for obi in stacks[stack]]
            obis = stacks[stack]  # TODO: need to add in OBI
            ofh.write(f'{spacer}"{stack}": [{",".join(obis)}]')
            ofh.write('\n')
            spacer = ","

        ofh.write("};\n")


if __name__ == "__main__":

    if len(sys.argv) != 3:
        sys.stderr.write(f"Usage: {sys.argv[0]} directory outfile\n")
        sys.exit(1)

    process(Path(sys.argv[1]), Path(sys.argv[2]))
