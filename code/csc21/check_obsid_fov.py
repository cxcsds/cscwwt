#!/usr/bin/env python

"""
Usage:
  ./combine_fovs.py fovfile outdir

Aim:

Identify possible "small dither" obsids.

"""

import glob
import os
from pathlib import Path
import time

import numpy as np
from matplotlib import pyplot as plt

import Polygon

import pycrates
import stk

from ciao_contrib.region.fov import FOVRegion


def read_polys_column(cr, col):
    """Read in the polygon coordinates from the column.

    Parameters
    ----------
    cr : pycrates.TABLECrate
    col : str
        The name of the vector array column (e.g. 'POS' or 'EQPOS')

    Returns
    -------
    polys : list
        Each polygon is a 2 by n array of values (n is not
        guaranteed to be the same). The arrays are guaranteed
        to only contain finite values and to be closed.
    """

    out = []

    for coldata in cr.get_column(col).values:

        xidx = np.isfinite(coldata[0, :])
        yidx = np.isfinite(coldata[1, :])

        assert np.all(xidx == yidx)
        store = coldata[:, xidx].copy()

        x = store[0]
        y = store[1]
        if (x[0] != x[-1]) or (y[0] != y[-1]):
            # too lazy to work out a nicer way to do this
            x = np.hstack(x, [x[0]])
            y = np.hstack(y, [y[0]])
            store = np.vstack((x, y))

        out.append(store)

    return out


def read_fov1_polygons(fov):
    """Return the polygon data from the fov block.

    Parameters
    ----------
    fov : str
        The name of the file containing the blockname block.

    Returns
    -------
    polys : dict
        Contains the keywords: 'transform', which is the
        SKY to celestial transformation; 'aimpoint', which is
        the pair (ra, dec); and 'polys_sky' and 'polys_cel',
        which are list of (2 by n) NumPy arrays for the SKY
        and celestial coordinates of the polygons. The coordinates
        are guaranteed to be closed and to have no NaN values,
        which means that the number of points can
        differ between each polygon. All polygons are assumed to
        be inclusive. There are also several keywords about the
        observation.

    Notes
    -----
    It is an error if there are any SHAPE values that are not
    "Polygon".

    """

    # Be explicit on the block and columns so that crates can
    # error out if something is missing.
    #
    # could generate the CEL values, but read them in too
    #
    infile = f"{fov}[FOV][columns SHAPE,POS,EQPOS]"
    cr = pycrates.read_file(infile)

    if cr.get_nrows() == 0:
        raise IOError("No data in {}".format(fov))

    shapes = set(cr.get_column('SHAPE').values)
    if len(shapes) != 1:
        raise IOError("{}: multiple shapes found: {}".format(fov, shapes))
    if 'Polygon' not in shapes:
        raise IOError("{}: expected Polygon, found {}".format(fov, shapes))

    tr = cr.get_transform('EQPOS')
    out = {'transform': tr,
           'obsid': cr.get_key_value('OBS_ID'),
           'detnam': cr.get_key_value('DETNAM'),
           'timedel': cr.get_key_value('TIMEDEL'),
           'cycle': cr.get_key_value('CYCLE'),
           'aimpoint': tr.get_parameter_value('CRVAL'),
           'polys_sky': read_polys_column(cr, 'POS'),
           'polys_cel': read_polys_column(cr, 'EQPOS')}
    return out


def transform_polygon(polys, tr):
    """Convert polygon to the SKY system in tr.

    Parameters
    ----------
    polys : list of polygons
        The output of read_stkfov3_polygons()
    tr : pytransform
        The sky to celestial transform for the base coordinate
        system. It is assumed that it does not match the
        transform of the input polygons.

    Returns
    -------
    converted : list of polygons
        The input polygons transformed to the SKY coordinate
        system of the base transform.
    """

    converted = []
    for poly in polys['polys_cel']:
        converted.append(tr.invert(poly.T).T)

    return converted


def polys_to_polyobj(polys):
    """Convert polygon coordinates into a polygon object.

    The polygon will be simplified.

    Parameters
    ----------
    polys : list of (2 by n) NumPy Arrays
        The polygon data to combine (e.g. as returned by
        read_polygons). This is expected to be in a consistent
        SKY coordinate system

    Returns
    -------
    polyobj : Polygon object

    See Also
    --------
    read_polygons
    polyobj_to_polys
    """

    poly = Polygon.Polygon()

    for sky in polys:

        poly.addContour(sky.T)

    poly.simplify()
    return poly


def polyobj_to_poly(poly):
    """Convert object to polygon coordinates.

    Parameters
    ----------
    polyobj : Polygon object

    Returns
    -------
    shapes : list of dict
        Each element represents a component: one include polygon
        and a list of excluded polygons.

    See Also
    --------
    read_polygons
    polys_to_polyobj

    Notes
    -----
    It is assumed that the inclusive polygons do not overlap,
    so that we can rearrange to make sure we have
    all includes and then all excludes.
    """

    """
    It used to be as simple as

    out = []
    for i in range(len(poly)):

        cxy = poly.contour(i)
        if cxy[0] != cxy[-1]:
            cxy.append(cxy[0])

        cxy = np.asarray(cxy).T
        out.append((poly.isSolid(i), cxy))

    return out

    """

    # Not sure what the best way to identify "components"
    # here. Is there something in the semantics of the GPC
    # polygon object that would tell us?
    #
    # Since the inclusive polygons do not overlap, by construction,
    # then use the bounding box of each polygon to determine the
    # association between include and exclude polygons.
    #
    incl = {}
    excl = {}

    for i in range(len(poly)):

        cxy = poly.contour(i)
        if cxy[0] != cxy[-1]:
            cxy.append(cxy[0])

        cxy = np.asarray(cxy).T

        incflag = poly.isSolid(i)
        bbox = poly.boundingBox(i)

        if incflag:
            store = incl
        else:
            store = excl

        assert bbox not in store
        store[bbox] = cxy

    assert len(incl) > 0

    # Match exclude with include shapes. This does a bit more than
    # is needed, to check the assumptions being used.
    #
    def is_inside(bbox_excl, bbox_incl):
        """Return True if bbox_excl is within bbox_incl."""

        xmin_i, xmax_i, ymin_i, ymax_i = bbox_incl
        xmin_e, xmax_e, ymin_e, ymax_e = bbox_excl

        return (xmin_e >= xmin_i) and (xmax_e <= xmax_i) \
            and (ymin_e >= ymin_i) and (ymax_e <= ymax_i)

    matches = {}
    for bb_e in excl.keys():
        match = None
        for bb_i in incl.keys():
            if is_inside(bb_e, bb_i):
                assert match is None
                match = bb_i

        assert match is not None
        try:
            l = matches[match]
        except:
            l = []

        l.append(bb_e)
        matches[match] = l

    out = []
    for bbox_i, p_i in incl.items():
        try:
            l = matches[bbox_i]
        except:
            l = []

        excls = [excl[idx] for idx in l]
        store = {'polygon': p_i, 'exclude': excls}
        out.append(store)

    return out


def plot_fov_raw(infile, obsid, timedel, outdir, clobber=True):

    outfile = outdir / f"fov.{obsid}.png"
    if not clobber and outfile.exists():
        raise OSError(f"{outfile} exists and clobber=False")

    fov = FOVRegion(infile)

    for pos in fov.pos.values():
        plt.plot(pos[0, :], pos[1, :], ls="solid", marker=None)

    ax = plt.gca()
    ax.set_aspect('equal')

    ax.set_title(f"ObsId: {obsid}   timedel: {timedel}")
    plt.savefig(outfile)


def plot_fov(shapes, obsid, timedel, outdir, clobber=True):

    outfile = outdir / f"fov.{obsid}.png"
    if not clobber and outfile.exists():
        raise OSError(f"{outfile} exists and clobber=False")

    for shape in shapes:
        if sorted(shape.keys()) != ["exclude", "polygon"]:
            raise RuntimeError(str(shape))

        pos = shape["polygon"]
        plt.plot(pos[0, :], pos[1, :], ls="solid", marker=None)

        for pos in shape['exclude']:
            plt.plot(pos[0, :], pos[1, :], ls="dotted", marker=None)

    ax = plt.gca()
    ax.set_aspect('equal')

    ax.set_title(f"ObsId: {obsid}   timedel: {timedel}")
    plt.savefig(outfile)


def check_fov1(infile, outdir, clobber=True):
    """Check if it looks like this OBSID may have a small dither.

    """

    outdir = Path(outdir)
    if not outdir.is_dir():
        raise OSError(f"{outdir} is not a directory")

    poly = read_fov1_polygons(infile)
    if not poly['detnam'].startswith('ACIS-'):
        raise ValueError(f"Unexpected DETNAM={poly['detnam']} in {infile}")

    detnam = set(int(d) for d in poly['detnam'][5:])

    # Transform the image to WCS coordinates.
    #
    tr = poly['transform']

    # Flatten the polygons
    #
    polys = poly['polys_sky']

    # Convert to a Polygon
    #
    polyobj = polys_to_polyobj(polys)
    combined = polyobj_to_poly(polyobj)

    # I didn't expect there to be an excluded shape, but it turns out
    # we have one, so plot if this happens.
    #
    for shape in combined:
        if len(shape['exclude']) != 0:
            plot_fov(combined, poly['obsid'], poly['timedel'], outdir, clobber=clobber)
            return

    # Lool for the expected number of chips
    #
    nshapes = len(combined)

    nexp = 0

    # ACIS-I
    if len(detnam.intersection(set([0, 1, 2, 3]))) > 0:
        nexp += 1

    detnam.discard(0)
    detnam.discard(1)
    detnam.discard(2)
    detnam.discard(3)

    # consecutive ACIS-S values; this is not clever...
    #
    mask = np.asarray([False] * 10, bool)
    for d in detnam:
        mask[d] = True

    # Look over ACIS-4 to ACIS-9
    #
    within = False
    for i in range(4, 10):
        if within:
            # Have we hit the end of the group?
            if not mask[i - 1]:
                within = False

        elif mask[i - 1]:
            # found a new block, so bump the expected number
            nexp += 1
            within = True

    if nshapes < nexp:
        raise RuntimeError(f"{infile}  DETNAM={poly['detnam']}  nshapes={nshapes} nexp={nexp}")

    if nshapes == nexp:
        return

    plot_fov(combined, poly['obsid'], poly['timedel'], outdir, clobber=clobber)


# I forget now what class is need to retain the formatting of this
# text when displayed.
#
help_str = """Check the FOV for possible low-dither observation.

"""

if __name__ == "__main__":

    import argparse
    import sys

    parser = argparse.ArgumentParser(description=help_str,
                                     prog=sys.argv[0])

    parser.add_argument('fovfile', type=str,
                        help='The fov1 file')
    parser.add_argument('outdir', type=str,
                        help='Name of output directory')
    parser.add_argument('--noclobber', action='store_true',
                        help='Clobber output file (default: %(default)s)')

    args = parser.parse_args(sys.argv[1:])

    check_fov1(args.fovfile, args.outdir,
                clobber=not args.noclobber)
