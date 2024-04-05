#!/usr/bin/env python -w

"""
Usage:

  ./parse_stack_mapping_from_mike.py <option>

Aim:

Construct a JSON file mapping from stack id to version number. The
assumption is that one version number is going to dominate the
counts, so we only have to give versions for stacks that don't
meet this version.

The option must be one of (although its value isn't actually checked):

  stkevt3
  stkecorrimg
  stkbkgimg
  stkexpmap
  sensity

and assumes there is only a single band for each stack (for the case
where there are multiple bands for a file type).

This relies on the data sent out-of-band by Mike and contained in

   csc21-mapping-from-mike.json

I also use csc21_ensembles.txt just to get a list of valid stackids
as a cross check.

"""

import sys
from typing import Any

from collections import OrderedDict, defaultdict
from dataclasses import dataclass
import json

options = ['stkevt3', 'stkecorrimg', 'stkbkgimg', 'stkexpmap', 'sensity']

@dataclass
class Mapping:

    stackid: str

    stkevt3: int
    stkecorrimg: int
    stkbkgimg: int
    stkexpmap: int
    sensity: int

    def __post_init__(self):
        if self.stackid is None:
            raise ValueError("what is going on")

        for option in options:
            attr = getattr(self, option)
            if attr is None:
                raise ValueError(f"stack {self.stackid} missing {option}")
            if not isinstance(attr, int):
                raise ValueError(f"stack {self.stackid} option {option} is not an int")


option_mapping = {'stkevt3': '_evt3.fits',
                  'stkecorrimg': '_img3.fits',
                  'stkbkgimg': '_bkgimg3.fits',
                  'stkexpmap': '_exp3.fits',
                  'sensity': '_sens3.fits'
                  }

def getint(stack: str, option: str, filename: str) -> int:
    """Extract version number.

    We require filename to be

       <stack>N<vvv>_<filetype>.fits

    where the filetype depends on option.
    """

    if not filename.startswith(f"{stack}N"):
        raise ValueError(f"Invalid filename {filename} for stack: {stack}")

    assert "N" not in stack
    pos = filename.find("N")
    vstr = filename[pos + 1: pos + 4]
    try:
        v = int(vstr)
    except ValueError:
        raise ValueError("Invalid version in {filename}") from None

    # check the ending, just because we can
    #
    if not filename.endswith(option_mapping[option]):
        raise ValueError(f"Invalid filename {filename} for option: {option}")

    return v

def read_mapping() -> dict[str, Mapping]:
    """"Read in the mapping data."""

    stacks = read_stacks()

    infile = "csc21-mapping-from-mike.json"
    with open(infile, mode="rt", encoding="utf-8") as fh:
        jsdata = json.load(fh)

    store: dict[str, dict[str, int]]
    store = defaultdict(dict)
    for jsobj in jsdata:
        stackid = jsobj["productId"]
        assert stackid in stacks  # safety check

        obj = store[stackid]
        key = jsobj["filetype"]
        assert key not in obj

        obj[key] = getint(stackid, key, jsobj["filename"])

    out: dict[str, Mapping]
    out = {}
    for key, vals in store.items():
        out[key] = Mapping(stackid=key, **vals)

    assert len(out) == len(stacks)  # safety check
    return out


def read_stacks() -> set[str]:
    """Read in the stack identifiers"""

    stacks = set()
    with open("csc21_ensembles.txt", mode="rt", encoding="utf-8") as fh:
        for line in fh.readlines():
            line = line.strip()
            if line == "" or line.startswith("#"):
                raise ValueError("Unexpected....")

            toks = line.split()
            assert len(toks) == 3
            for stackid in toks[2].split(","):
                assert stackid not in stacks
                stacks.add(stackid)

    assert len(stacks) > 0
    return stacks


def convert(option: str) -> None:

    mapping = read_mapping()

    # Force an ordering to avoid un-needed reloads (by web browser)
    out: dict[str, Any]
    out = OrderedDict()
    out['filetype'] = option
    out['versions'] = OrderedDict()

    # Grab the file name and extract the version number.
    #
    versions: dict[str, int]
    versions = defaultdict(int)
    for stack, mdata in mapping.items():
        ver = getattr(mdata, option)
        out['versions'][stack] = ver
        versions[ver] += 1

    # What is the default version
    vs = sorted(list(versions.items()), key=lambda x: x[1], reverse=True)
    assert len(vs) > 0
    default_version = vs[0][0]
    ndef = vs[0][1]

    # Output to stderr so not included in output
    sys.stderr.write("Version breakdown\n")
    for v, c in vs:
        sys.stderr.write(f"  version= {v:3d}  count= {c}\n")

    out['default_version'] = default_version
    out['ndefault_version'] = ndef
    delete = []
    for stack, ver in out['versions'].items():
        if ver == default_version:
            delete.append(stack)

    assert len(delete) == ndef
    for stack in delete:
        del out['versions'][stack]

    print(json.dumps(out))


options = ['stkevt3', 'stkecorrimg', 'stkbkgimg', 'stkexpmap', 'sensity']


def usage():
    sys.stderr.write(f"Usage: {sys.argv[0]} <option>\n")
    sys.stderr.write("\n<option> is one of:\n")
    sys.stderr.write(f"  {' '.join(options)}\n")
    sys.exit(1)


if __name__ == "__main__":

    nargs = len(sys.argv)
    if nargs != 2:
        usage()

    filetype = sys.argv[1]
    if filetype not in options:
        raise ValueError(f"Unknown option: {filetype}")

    convert(filetype)
