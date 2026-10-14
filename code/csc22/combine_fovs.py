#!/usr/bin/env python

"""
Usage:
  ./combine_fovs.py fovdir stackfile stack outfile

Aim:

Take the FOVs for the stack, reproject them to one of the
obsids, and then create a merged FOV.

fovdir is the directory containing obsid/primary/*_fov1.fits.gz
from the archive.

"""

import glob
import os
import time

import numpy as np

import pycrates
import stk

import Polygon


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
        be inclusive.

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


def add_column(crate, name, data,
               cpts=None, unit=None, desc=None,
               transform=None, vname=None, vcpts=None):
    """Add the column to the crate.

    Parameters
    ----------
    crate : TABLECrate object
    name : str
        Name of the column.
    data
        The column data
    cpts : None or sequence of str
        The names of the components of the vector name.
    unit : None or str, optional
        The column units (if available)
    desc : None or str, optional
        The column description (if available)
    transform : None or pytransform, optional
        The transform to add to this column. If transform is not None
        then vname and vcpts must be given.
    vname : None or str
        The name of the transformed column.
    vcpts : None or sequence of str
        The name of the transformed column components.

    Notes
    -----
    Probably doesn't handle vector columns well.

    It is not clear how to add a transform to a "scalar" column.
    """

    if cpts is None:
        cd = pycrates.CrateData()
        cd.name = name
    else:
        # validate length; is this a generic-enough test?
        if len(cpts) != data.shape[1]:
            raise ValueError("Data shape={}  does not match cpts={}".format(data.shape, cpts))

        cd = pycrates.create_vector_column(name, cpts)

    cd.values = data
    if unit is not None:
        cd.unit = unit
    if desc is not None:
        cd.desc = desc

    crate.add_column(cd)

    # Create a virtual column/vector if the transform is specified.
    #
    if transform is not None:
        if vname is None or vcpts is None:
            raise ValueError("vname and vcpts must be set when the transform is")

        vcd = pycrates.create_virtual_column(cd, vname, vcpts,
                                             transform)
        crate.add_column(vcd)


def make_fov(outfile, shapes, transform,
             base_obsid,
             stack,
             obsids,
             creator="combine_fovs.py",
             clobber=False):
    """Create a FOV file.

    This is not guaranteed to be complete/match the FOV specifications.

    Paramerers
    ----------
    outfile : str
        File name.
    shapes : list of dict
        The output of polyobj_to_poly
    transform : pytransform
        The SKY to celestial transform for base_obsid.
    base_obsid: int
        The OBSID from which transform was taken.
    stack : str
        The stack name.
    obsids : list of int
        The OBSIDS values in this stack.
    clobber : bool, optional
        Should the output file be overwritten if it exists?

    Notes
    -----
    I am not guaranteeing a sensible FOV block (i.e. one that
    has the correct column definitions and header information).

    """

    # The following has been pieced together from a bunch of sources,
    # so it's not as neat / sensible as it should be.
    #

    if not clobber and os.path.exists(outfile):
        raise IOError(f"outfile={outfile} exists and clobber=False")

    # what is the maximum number of vertexes?
    # what is the number of rows
    #
    def get_npts(poly, nmax):
        assert poly.ndim == 2
        assert poly.shape[0] == 2
        n = poly.shape[1]
        if n > nmax:
            return n
        else:
            return nmax

    nmax = 0
    nrows = 0
    for shape in shapes:
        nmax = get_npts(shape['polygon'], nmax)
        nrows += 1
        for p in shape['exclude']:
            nmax = get_npts(p, nmax)
            nrows += 1

    assert nmax > 3
    assert nrows > 0

    cr = pycrates.TABLECrate()
    cr.name = 'FOV'

    timestr = time.strftime("%Y-%m-%dT%H:%M:%S")
    hdrvals = [('CREATOR', creator,
                'tool that created this output'),
               ('DATE', timestr,
                'Date and time of file creation'),
               ('STACKID', stack,
                'The stack without the trailing version'),
               ('BASE_ID', base_obsid,
                'OBSID used for the SKY to CEL transform'),
               ('NOBSID', len(obsids),
                'Number of obsids in the stack'),
               ]

    for i, obsid in enumerate(obsids):
        hdrvals.append((f'OBSID{i:03d}', obsid,
                        'OBSID in the stack'))

    for name, value, desc in hdrvals:
        key = pycrates.CrateKey()
        key.name = name
        key.value = value
        key.desc = desc
        cr.add_key(key)

    # Create the data (assumed to be a small number of rows
    # so doing it per column is not a problem for memory or
    # run time).
    #
    #  component number
    #  include/exclude flag
    #  number of vertices
    #  coordinates
    #
    cpt_data = np.zeros(nrows, dtype=np.int16)
    iflag_data = np.zeros(nrows, dtype=np.bool)
    nvert_data = np.zeros(nrows, dtype=np.int16)

    pos_data = np.nan + np.zeros(nrows * 2 * nmax, dtype=np.float64)
    pos_data.resize(nrows, 2, nmax)

    def check_closed(poly):
        if (poly[:, 0] != poly[:, -1]).any():
            print("Polygon is not closed: {} {}".format(poly[:, 0],
                                                        poly[:, -1]))

    i = 0
    for ctr, shape in enumerate(shapes):

        # COMPONENT number is 1 based
        cpt_num = ctr + 1
        cpt_data[i] = cpt_num
        iflag_data[i] = True

        poly = shape['polygon']
        check_closed(poly)

        npts = poly.shape[1]
        nvert_data[i] = npts

        assert poly.shape == (2, npts)

        pos_data[i][0][0:npts] = poly[0]
        pos_data[i][1][0:npts] = poly[1]

        i += 1

        for poly in shape['exclude']:

            check_closed(poly)

            cpt_data[i] = cpt_num
            iflag_data[i] = False

            npts = poly.shape[1]
            nvert_data[i] = npts

            assert poly.shape == (2, npts)

            pos_data[i][0][0:npts] = poly[0]
            pos_data[i][1][0:npts] = poly[1]

            i += 1

    # Convert iflag_data into shape column (could have been done above).
    #
    def make_shape(f):
        if f:
            return 'Polygon'
        else:
            return '!Polygon'

    shape = np.asarray([make_shape(iflag) for iflag in iflag_data])

    add_column(cr, 'COMPONENT', cpt_data, desc='Component number')
    add_column(cr, 'SHAPE', shape,
               desc='Region shape type')
    add_column(cr, 'NVERTEX', nvert_data,
               desc='Number of vertexes in the polygon')
    add_column(cr, 'POS', pos_data,
               cpts=['X', 'Y'],
               unit='pixel', desc='Position',
               transform=transform,
               vname='EQPOS', vcpts=['RA', 'Dec'])

    # dummy columns; forutnately both the same
    # dummy = np.nan * np.zeros((npoly, 2))
    # add_column(cr, 'R', dummy, desc='Radius')
    # add_column(cr, 'ROTANG', dummy, desc='Angle')

    cr.write(outfile, clobber=clobber)
    print("Created: {}".format(outfile))


def find_stacks(stackfile, stack):
    """Return the obsids of the elements of the stacj.

    An IOError is raised if the stack is unknown.

    Parameters
    ----------
    stackfile : str
        The name of the file.
    stack : str
        The stack identifier

    Returns
    -------
    obsids : list of int
        This list can not be empty.
    """

    infile = f"{stackfile}[col1={stack}][cols col2]"
    cr = pycrates.read_file(infile)
    if cr.get_nrows() == 0:
        raise IOError(f"stack {stack} not found in {stackfile}")

    if cr.get_nrows() != 1:
        raise IOError(f"multiple rows for stack {stack} not found in {stackfile}")

    vals = cr.get_column(0).values[0]
    return [int(v) for v in stk.build(vals)]


def find_fov_files(fovdir, obsids):
    """What fov files do we know.

    Parameters
    ----------
    fovdir : str
        The location of the fov files; the files are called
        obsid/primary/*_fov1.fits.gz
    obsids : list of int
        The obsids to find.

    Returns
    -------
    fovmap : dict
        The keyword is the obsid and the value the file name.

    """

    out = {}
    for obsid in obsids:
        pattern = f"{fovdir}/{obsid}/primary/*_fov1.fits.gz"
        matches = glob.glob(pattern)
        if len(matches) == 0:
            raise OSError(f"No FOV for obsid={obsid}")

        if len(matches) == 2:

            # hard-code the one oni case we currently have, 1561 where we
            # want to use both
            #
            if obsid == 1561:
                out[obsid] = tuple(matches)
                continue

            if "e1" in matches[0]:
                cr = pycrates.read_file(matches[0])
                if cr.get_key_value("CYCLE") == "P":
                    out[obsid] = matches[0]
                    continue

            if "e1" in matches[1]:
                cr = pycrates.read_file(matches[1])
                if cr.get_key_value("CYCLE") == "P":
                    out[obsid] = matches[1]
                    continue

            raise OSError(f"No CYCLE=P in {matches} for obsid={obsid}")

        if len(matches) > 1:
            raise OSError(f"Multiple FOV files for obsid={obsid}")

        if obsid in out:
            raise RuntimeError(f"Multiple obsid {obsid}")

        out[obsid] = matches[0]

    return out


def make_stkfov(fovdir, stackfile, stack, outfile,
                clobber=False):
    """Combine the FOV files for a stack.

    The STKFOV block contains the possibly-simplified polygon
    data of the fov files.

    Paramerers
    ----------
    fovdir : str
        The name of the directory containing the fov files
    stackfile : str
        The name of the stack to obsid mapping
    stack : str
        The stack identifier
    outfile : str
        File name.
    clobber : bool, optional
        Should the output file be overwritten if it exists?

    Notes
    -----
    I am not guaranteeing a sensible STKFOV block (i.e. one that
    has the correct column definitions and header information).

    """

    if not clobber and os.path.exists(outfile):
        raise IOError("outfile={} exists and clobber=False".format(outfile))

    if not os.path.isdir(fovdir):
        raise IOError("fovdir={} is missing or is not a directory".format(fovdir))

    obsids = find_stacks(stackfile, stack)
    fovfiles = find_fov_files(fovdir, obsids)

    polys = {}

    ras = []
    decs = []
    for obsid, infile in fovfiles.items():

        # for obsd 1561 we have two FOV files but but the same WCS,
        # so we can combine the data
        #
        if obsid == 1561:
            poly1 = read_fov1_polygons(infile[0])
            poly2 = read_fov1_polygons(infile[1])
            ra, dec = poly1["aimpoint"]
            ras.append(ra)
            decs.append(dec)

            poly1['polys_sky'].extend(poly2['polys_sky'])
            poly1['polys_cel'].extend(poly2['polys_cel'])

            polys[obsid] = poly1
            continue

        poly = read_fov1_polygons(infile)
        ra, dec = poly['aimpoint']
        ras.append(ra)
        decs.append(dec)
        polys[obsid] = poly

    # Pick the first obsid as the base case (the shifts should not
    # be huge here for a stack, unlike the ensemble case).
    #
    base_obsid = obsids[0]
    base_tr = polys[base_obsid]['transform']

    # Transform all the polygons to the base_tr coordinate system
    # and flatten the list
    conv_polys = []
    for poly in polys[base_obsid]['polys_sky']:
        conv_polys.append(poly)

    for obsid in obsids:
        for poly in transform_polygon(polys[obsid], base_tr):
            conv_polys.append(poly)

    # Convert to a Polygon
    #
    polyobj_stk = polys_to_polyobj(conv_polys)
    poly_stk = polyobj_to_poly(polyobj_stk)

    # Write out the results
    make_fov(outfile, poly_stk, base_tr,
             base_obsid, stack, obsids,
             clobber=clobber)


# I forget now what class is need to retain the formatting of this
# text when displayed.
#
help_str = """Combine the obsids FOVs to create a stack file.

This is approximate as we don't include the fine-astrometry
correction or asol filtering that CSC does.

"""

if __name__ == "__main__":

    import argparse
    import sys

    parser = argparse.ArgumentParser(description=help_str,
                                     prog=sys.argv[0])

    parser.add_argument('fovdir', type=str,
                        help='Directory containing obsid/primary/*fov1.fits.gz files')
    parser.add_argument('stackfile', type=str,
                        help='a mapping between stack and obsids')
    parser.add_argument('stack', type=str,
                        help='The stack identifier')
    parser.add_argument('outfile', type=str,
                        help='Name of output file')
    parser.add_argument('--clobber', action='store_true',
                        help='Clobber output file (default: %(default)s)')

    args = parser.parse_args(sys.argv[1:])

    make_stkfov(fovdir=args.fovdir,
                stackfile=args.stackfile,
                stack=args.stack,
                outfile=args.outfile,
                clobber=args.clobber)
