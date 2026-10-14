#!/usr/bin/env python

import sys

from matplotlib import pyplot as plt

import pycrates

def plot_fov(infile):
    cr = pycrates.read_file(f"{infile}[FOV][cols SHAPE,NVERTEX,POS]")

    stack = cr.get_key_value("STACKID")
    if stack is None:
        raise OSError(f"No STACKID in {infile}")

    nobsid = cr.get_key_value("NOBSID")
    obsids = [cr.get_key_value(f"OBSID{i:03d}")
              for i in range(nobsid)]
    obsidstr = ", ".join([str(o) for o in obsids])

    shapes = cr.SHAPE.values
    nvs = cr.NVERTEX.values
    poss = cr.POS.values
    for shape, nv, pos in zip(shapes, nvs, poss):
        excl = shape.startswith('!')
        ls = "dotted" if excl else "solid"
        plt.plot(pos[0], pos[1], ls=ls, marker=None)

    ax = plt.gca()
    ax.set_aspect('equal')

    ax.set_title(f"{stack}: {obsidstr}")


if __name__ == "__main__":

    if len(sys.argv) != 3:
        sys.stderr.write(f"Usage: {sys.argv[0]} fovfile outfile\n")
        sys.exit(1)

    plot_fov(sys.argv[1])
    plt.savefig(sys.argv[2])
