#!/usr/bin/env python

"""
Usage:

  ./find_stack_obi_name_mapping.py outfile

Aim:

Map from stack name to obsid, obi, and target name.

The output is written to outfile

Requires
--------

  stk_obi_csc22.txt
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


def read_csc22_stack_combined():
    """Read in the stack - obs data mapping."""

    infile = "stk_obi_csc22.txt"
    out = {}
    with open(infile, mode="rt") as ifh:
        for line in ifh.readlines():
            line = line.strip()
            if line == '':
                continue

            toks = line.split(' ')
            assert len(toks) == 2, line
            stack, comb = toks
            assert comb[5] == '_'
            obsid = comb[:5]
            obi = comb[6:]

            store = (obsid, obi, comb)
            try:
                out[stack].append(store)
            except KeyError:
                out[stack] = [store]

    if len(out) == 0:
        raise OSError(f"No data from {infile}")

    return out


def process(outfile: Path
            ) -> None:
    """Read in the stack data."""

    # Get the mapping from obsid to obi and name
    obspar = read_obsid_obi_name()

    # Read in the stack,obsid,obi mapping
    obsdata = read_csc22_stack_combined()

    # I had wanted to create a FITS file (since that makes the name
    # column a lot easier to handle), but memory issues (I don't
    # understand why) caused me to switch to just writing out
    # the data as processed as an ASCII file).
    #
    stacks = sorted(obsdata.keys())
    assert len(stacks) == len(set(stacks))  # check no duplicates

    nobs = 0
    with outfile.open(mode='wt') as ofh:

        ofh.write("# stack obsid obi combined target\n")
        ofh.flush()

        for stack in stacks:
            for (obsid, obi, comb) in obsdata[stack]:
                nobs += 1

                # What name to use
                (_, _, name) = obspar[int(obsid)]

                ofh.write(f"{stack:24s} {int(obsid):5d} {int(obi):3d} ")
                ofh.write(f"{comb:9s} ")
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

    print(f"Found {len(stacks)} stacks, {nobs} observations")
    print(f"Created: {outfile}")


if __name__ == "__main__":

    if len(sys.argv) != 2:
        sys.stderr.write(f"Usage: {sys.argv[0]} outfile\n")
        sys.exit(1)

    process(Path(sys.argv[1]))
