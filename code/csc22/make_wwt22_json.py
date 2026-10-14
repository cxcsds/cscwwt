#!/usr/bin/env python

"""
Usage:

  ./make_wwt22_json.py infile

Aim:

Requires:

  csc2.2-new-obsids-from-database.txt
  wwt22_counts.js (output of make_wwt22_counts.py)

which lists the obsid/obi pairs that are new to CSC 2.2.

Creates

  wwt22_names.js
  wwt22_obis.js
  wwt22_stacks.json

based on the infile, which is assumed to be the output of
find_stack_obi_name_mapping.py

"""

from pathlib import Path
import sys

import pycrates


def read_newdata(infile: Path) -> set[str]:
    """The new observations in CSC 2.2"""

    cr = pycrates.read_file(str(infile))
    out: list[str] = []
    for obsid, obi in zip(cr.get_column("obsid").values,
                          cr.get_column("obi").values):
        out.append(f"{int(obsid):05d}_{int(obi):03d}")

    ret = set(out)
    if len(ret) != len(out):
        raise ValueError("reported data somwhere ...")

    return ret


def read_counts() -> dict[str, int]:
    """Read in the stack count from wwt22_counts.js

    After writing make_wwt22_counts.py I decided to include this
    information in the stack file, but quicker to decode the
    output of the script rather than add the logic here.
    """

    out = {}
    found_end = False
    with open("wwt22_counts.js", mode="rt") as ifh:
        starter = True
        for txt in ifh.readlines():
            txt = txt.strip()
            if found_end:
                raise ValueError(f"should not have line '{txt}' after end")

            if starter:
                if txt != "var stack_count = {":
                    raise ValueError(f"Starting text wrong: '{txt}'")
                starter = False
                continue

            if txt == "};":
                found_end = True
                continue

            start = txt.find('"')
            if start == -1:
                raise ValueError(f"no start quote in '{txt}'")

            start += 1
            end = txt.find('"', start)
            if end == -1:
                raise ValueError(f"no end quote in '{txt}'")

            stack = txt[start:end]
            if stack in out:
                raise ValueError(f"Multiple stack={stack}")

            colon = txt.find(":", end)
            if colon == -1:
                raise ValueError(f"no colon in '{txt}'")

            out[stack] = int(txt[colon + 1:])

    if not found_end:
        raise ValueError("did not find end of file")

    if len(out) == 0:
        raise ValueError("no count data read in")

    return out


def read_infile(infile: Path,
                newdata: set[str]
                ) -> dict[str, dict]:
    """Read in the input file

    """

    counts = read_counts()

    cr = pycrates.read_file(str(infile))
    out = {}
    for stack, combined, name in zip(cr.get_column("stack").values,
                                     cr.get_column("combined").values,
                                     cr.get_column("target").values):

        name = name.strip()
        if name == "":
            raise OSError(f"stack {stack} {combined} name is empty")

        if stack in out:
            out[stack]["names"].add(name)
            out[stack]["obs"].append(combined)

        else:
            if stack not in counts:
                raise OSError(f"stack {stack} not in counts data!")

            out[stack] = {"names": set([name]),
                          "obs": [combined],
                          "nsrc": counts[stack]}

    # Now all the data has been processed we can identify the status:
    #   unchanged   no change to CSC 2.1
    #   updated     obsid from CSC 2.2 added
    #   new         all obsid from CSC 2.2
    #
    for stack, stackdata in out.items():
        obs = set(stackdata["obs"])

        intersect = newdata.intersection(obs)
        if intersect == obs:
            status = "new"
        elif len(intersect) > 0:
            status = "updated"

            # For some reason we want to identify the new obsids
            stackdata["new_obs"] = sorted(intersect)

        else:
            status = "unchanged"

        stackdata["status"] = status

    return out


def write_obis(data: dict) -> None:
    """Create wwt22_obis.js"""

    outfile = "wwt22_obis.js"
    with open(outfile, mode="wt") as ofh:
        ofh.write("var obi_map = {\n")

        sep = ""
        for stack, vals in data.items():
            ofh.write(f'{sep}"{stack}": [')
            ofh.write(','.join([f'"{obs}"' for obs in vals["obs"]]))
            ofh.write(f']\n')
            sep = ','

        ofh.write("};\n")

    print(f"Created: {outfile}")


def write_names(data: dict) -> None:
    """Create wwt22_names.js

    Note that the names are converted to upper case, but unlike
    CSC 2.1, the spaces are not removed.
    """

    outfile = "wwt22_names.js"
    with open(outfile, mode="wt") as ofh:
        ofh.write("var stack_name_map = {\n")

        sep = ""
        for stack, vals in data.items():
            ofh.write(f'{sep}"{stack}": [')
            names = set(name.upper() for name in vals["names"])
            ofh.write(','.join([f'"{name}"' for name in names]))
            ofh.write(f']\n')
            sep = ','

        ofh.write("};\n")

    print(f"Created: {outfile}")


def write_stacks(data: dict) -> None:
    """Create wwt22_stacks.json"""

    outfile = "wwt22_stacks.json"
    with open(outfile, mode="wt") as ofh:
        ofh.write("{\n")

        sep = ""
        for stack, vals in data.items():
            ofh.write(f'{sep}"{stack}": {{\n')
            ofh.write(f'"stacktype": "{vals["status"]}"\n')

            ofh.write(',"obsids": [')
            ofh.write(','.join([f'"{obs}"' for obs in vals["obs"]]))
            ofh.write(']\n')

            ofh.write(',"names": [')
            ofh.write(','.join([f'"{name}"' for name in vals["names"]]))
            ofh.write(']\n')

            if "new_obs" in vals:
                ofh.write(',"new_obsids": [')
                ofh.write(','.join([f'"{obs}"' for obs in vals["new_obs"]]))
                ofh.write(']\n')

            ofh.write(f',"nsource": {vals["nsrc"]}\n')

            ofh.write('}\n')
            sep = ','

        ofh.write("}\n")

    print(f"Created: {outfile}")


def doit(infile: Path) -> None:
    """process the data"""

    newdata = read_newdata(Path('csc2.2-new-obsids-from-database.txt'))
    data = read_infile(infile, newdata)
    write_obis(data)
    write_names(data)
    write_stacks(data)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write(f"Usage: {sys.argv[0]} infile\n")
        sys.exit(1)

    doit(Path(sys.argv[1]))
