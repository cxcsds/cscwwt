#!/usr/bin/env python

"""
Usage:

  ./find_stack_obi_name_mapping.py stackfovdir outfile

Aim:

Map from stack name to obsid, obi, and target name.

The output is written to outfile

Requires
--------

The stackfovdir contains all the FOV files for the stacks.
This also gives us the OBSID values but not the OBI values.

  obspar.fits


"""

from pathlib import Path
import sys

import numpy as np

import pycrates


def read_obsid_obi_name() -> dict[int, tuple[int, list[int], str]]:
    """Store the obsid,obi,name data

    key is obsid, stored is obsid, list of obis, and the object name.
    """

    cr = pycrates.read_file("obspar.fits[cols obs_id,obi_num,object]")
    out = {}
    for xobsid,xobi,name in zip(cr.get_column('obs_id').values,
                                cr.get_column('obi_num').values,
                                cr.get_column('object').values):
        obsid = int(xobsid)
        obi = int(xobi)
        try:
            out[obsid][1].append(obi)
            if name != out[obsid][2]:
                # Is this worth warning about?
                print(obsid, out[obsid][1],
                      f"<{name}>", f"<{out[obsid][2]}>")

            # again, mainly for curiosity
            if len(out[obsid][1]) != 2:
                print(out[obsid])

        except KeyError:
            out[obsid] = (obsid, [obi], name)

    print(f"Found {len(out)} OBSIDs")
    return out


def read_fov_for_obsids(fovpath: Path) -> tuple[str, list[int]]:
    """Return the stack identifier and the obsids in the stack.

    The input comes from the stack file.

    """

    cr = pycrates.read_file(str(fovpath) + "[#row=1]")
    if cr.get_nrows() == 0:
        raise OSError(str(fovfile))

    # Ensure we copy the stack value just in case it's leaking memory
    stack = cr.get_key_value("STACK_ID")[:]

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

    return stack, sorted(obsids)


def process(indir: Path,
            outfile: Path
            ) -> None:
    """Read in the stack data."""

    if not indir.is_dir():
        raise OSError(f"indir={indir} is not a directory")

    # Get the mapping from obsid to obi and name
    obspar = read_obsid_obi_name()

    # I had wanted to create a FITS file (since that makes the name
    # column a lot easier to handle), but memory issues (I don't
    # understand why) caused me to switch to just writing out
    # the data as processed as an ASCII file).
    #
    nstk = 0
    nobsid = 0
    seen = set()
    seen_obsids = set()
    with outfile.open(mode='wt') as ofh:

        ofh.write("# stack obsid obi combined target\n")
        ofh.flush()

        for infov in sorted(indir.glob("*_fov3.fits*")):
            stack, obsids = read_fov_for_obsids(infov)
            if stack in seen:
                raise OSError(f"Multiple stack {stack} {infov}")

            nstk += 1
            nobsid += len(obsids)

            seen.add(stack)
            for obsid in obsids:
                if obsid in seen_obsids:
                    print(f"Note: obsid {obsid} in stack {stack} and other")
                else:
                    seen_obsids.add(obsid)

                # Work out what obis to add.
                (_, obis, name) = obspar[obsid]
                if len(obis) > 1:
                    print(obsid, obis, name)

                for obi in obis:
                    ofh.write(f"{stack:24s} {obsid:5d} {obi:3d} ")
                    ofh.write(f"{obsid:05d}_{obi:03d} ")
                    if "'" in name:
                        if '"' in name:
                            raise OSError("who let name=[{name}] through!")

                        nameval = f'"{name}"'
                    elif '"' in name:
                        nameval = f"'{name}'"
                    else:
                        nameval = f'"{name}"'

                    ofh.write(f'{nameval}\n')

            ofh.flush()

    if nstk == 0:
        raise OSError("No stacks found")

    print(f"Found {nstk} stacks, {nobsid} obsids")
    print(f"Created: {outfile}")


if __name__ == "__main__":

    if len(sys.argv) != 3:
        sys.stderr.write(f"Usage: {sys.argv[0]} directory outfile\n")
        sys.exit(1)

    process(Path(sys.argv[1]), Path(sys.argv[2]))
