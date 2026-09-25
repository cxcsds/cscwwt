'use strict';

// We require that the wwt code is available (for access to the spinner).
//
// This is labelled "cone" even if we end up
//  a) using the TAP endpoint instead
//  b) just use a "mark and sweep" search to filter on ra and dec
//     individually, rather than a cone search.
//
// HEASARC TAP service
// https://heasarc.gsfc.nasa.gov/xamin/vo/tap
// XMM catalog name is xmmssc
// columns: name ra dec ...
//
// SELECT m.ra, m.dec FROM XMMSSC as m WHERE <spatial filter>
//
// ARGH: looks like XAMIN does not have CORS set

const cone = (function () {

    // This is a version-specific end point. It is assumed to create
    // tables that follow version 1.2 of the VOTable specification.
    //
    // const TAP = "https://cda.cfa.harvard.edu/csc21tap/sync";
    // const TAP = "https://cda.cfa.harvard.edu/csc22tap/sync";
    const TAP = "https://cda.cfa.harvard.edu/csc_snapshot_tap/sync";

    // Unfortunately this does not support CORS
    const XMMTAP = "https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync";

    // Follow https://developer.mozilla.org/en-US/docs/Web/XML/XPath/Guides/Introduction_to_using_XPath_in_JavaScript#implementing_a_user_defined_namespace_resolver
    // but as the response has a default namespace we just have to
    // fake it.
    //
    function nsResolver(prefix) {
	return "http://www.ivoa.net/xml/VOTable/v1.2";
    }

    // Should there be some handling of "null" values?
    function convertToBool(v) {
	v = v.trim();
	if (v === "F") { return 0; }
	if (v === "T") { return 1; }
	wwt.trace(`ERROR: expected T/F but got '${v}'`);
	return 0;  // do not want to deal with error handling here
    }

    function convertToInt(v) {
	v = v.trim();
	if (v === "") { return -999; }
	// could return -999 if the value is negative (as we only have positive
	// integers in this table).
	return parseInt(v);
    }

    function convertToFloat(v) {
	if (v === null) { return null; } // why is this needed
	v = v.trim();
	if (v === "") { return null; }
	return parseFloat(v);
    }

    // Where are the names of the columns? This could be made generic but
    // for now hard-code the expected response size.
    //
    const namePath = "/vot:VOTABLE/vot:RESOURCE/vot:TABLE/vot:FIELD/attribute::name";
    const expectedCols = [
	{name: "name", convert: (x) => { return x; }},
	{name: "ra", convert: convertToFloat},
	{name: "dec", convert: convertToFloat},
	{name: "err_ellipse_r0", convert: convertToFloat},
	{name: "err_ellipse_r1", convert: convertToFloat},
	{name: "err_ellipse_ang", convert: convertToFloat},
	{name: "conf_flag", convert: convertToBool},
	{name: "extent_flag", convert: convertToBool},
	{name: "sat_src_flag", convert: convertToBool},
	{name: "acis_num", convert: convertToInt},
	{name: "hrc_num", convert: convertToInt},
	{name: "var_flag", convert: convertToBool},
	{name: "significance", convert: convertToFloat},
	{name: "flux_aper_b"}, // fluxes are manually converted
	{name: "flux_aper_lolim_b"},
	{name: "flux_aper_hilim_b"},
	{name: "flux_aper_w"},
	{name: "flux_aper_lolim_w"},
	{name: "flux_aper_hilim_w"},
	{name: "nh_gal", convert: convertToFloat},
	{name: "hard_hm", convert: convertToFloat},
	{name: "hard_hm_lolim", convert: convertToFloat},
	{name: "hard_hm_hilim", convert: convertToFloat},
	{name: "hard_ms", convert: convertToFloat},
	{name: "hard_ms_lolim", convert: convertToFloat},
	{name: "hard_ms_hilim", convert: convertToFloat},
    ];

    // This is currently unused
    const xmmExpectedCols = [
	{name: "ra", convert: convertToFloat},
	{name: "dec", convert: convertToFloat},
    ];

    const rowsPath = "/vot:VOTABLE/vot:RESOURCE/vot:TABLE/vot:DATA/vot:TABLEDATA/vot:TR";
    const tdPath = "vot:TD";

    // Extract the data from the given row (a snapshot element of rowsPath).
    //
    function convertRow(row) {

	/// Assume a fixed structure rather than use a generic setup.
	//
	const ncols = expectedCols.length;
	if (row.children.length !== ncols) {
	    wwt.trace(`ERROR: row expected ${ncols} items but got ${row.children.lengthh}`);
	    return null;
	}

	// Create a dictionary of the row.
	//
	let temp = {};
	for (let i = 0; i < ncols; i++) {
	    temp[expectedCols[i].name] = row.children[i].innerHTML;
	}

	// Skip extended sources.
	//
	if (temp["name"].endsWith("X")) {
	    wwt.trace(`Skipping extended source: ${temp['name']}`);
	    return null;
	}

	// Is this a b-band or w-band observation?
	// There should only be one but in CSC 2.1 a few sources have
	// both: it is safe to assume "b" band in these cases.
	//
	let fb = temp["flux_aper_b"];
	let fw = temp["flux_aper_w"];
	let band = -1;
	let flux = null;
	let fluxlo = null;
	let fluxhi = null;

	if (fb !== "") {
	    band = 0;
	    flux = fb;
	    fluxlo = temp["flux_aper_lolim_b"];
	    fluxhi = temp["flux_aper_hilim_b"];
	} else if (fw !== "") {
	    band = 1;
	    flux = fw;
	    fluxlo = temp["flux_aper_lolim_w"];
	    fluxhi = temp["flux_aper_hilim_w"];
	}

	let out = {fluxband: band,
		   flux: convertToFloat(flux),
		   flux_lolim: convertToFloat(fluxlo),
		   flux_hilim: convertToFloat(fluxhi)
		  };
	for (let i = 0; i < ncols; i++) {
	    let colinfo = expectedCols[i];
	    if ("convert" in colinfo) {
		out[colinfo.name] = colinfo.convert(temp[colinfo.name])
	    }
	}

	return out;
    }

    // Extract the data from the given row (a snapshot element of rowsPath).
    //
    function xmmConvertRow(row) {

	/// Assume a fixed structure rather than use a generic setup.
	//
	const ncols = xmmExpectedCols.length;
	if (row.children.length !== ncols) {
	    wwt.trace(`ERROR: row expected ${ncols} items but got ${row.children.lengthh}`);
	    return null;
	}

	// Create a dictionary of the row.
	//
	let temp = {};
	for (let i = 0; i < ncols; i++) {
	    temp[xmmExpectedCols[i].name] = row.children[i].innerHTML;
	}

	let out = {};
	for (let i = 0; i < ncols; i++) {
	    let colinfo = xmmExpectedCols[i];
	    out[colinfo.name] = colinfo.convert(temp[colinfo.name])
	}

	return out;
    }

    // Convert a VOTable to JSON. It is only intended to handle the
    // type of table returned by the CSC cone search interface, and so
    // is not a generic routine. It is also designed to convert the
    // response to match that used when the data was pre-compiled to
    // JSON.
    //
    // The return is an array of structures, which may be empty.
    //
    function votToJSON(expected, convert, xml) {

	const namesResult = xml.evaluate(namePath, xml, nsResolver,
					 XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
	for (let i = 0; i < namesResult.spanshotLength; i++) {
	    let got = namesResult.snapshotItem(i).nodeValue;
	    if (got !== expected[i].name) {
		wwt.trace(`ERROR: column ${i} expected '${expected[i].name}' got '${got}'`);
		return null;
	    }
	}
	if (namesResult.snapshotLength !== expected.length) {
	    wwt.trace(`ERROR: expected ${expected.length} columns but got '${namesResult.snapshotLength}'`);
	    return null;
	}

	let rows = [];
	const rowsResult = xml.evaluate(rowsPath, xml, nsResolver,
					XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
	const ntotal = rowsResult.snapshotLength;
	wwt.trace(`Found ${ntotal} rows in search`);
	for (let i = 0; i < ntotal; i++) {
	    let row = convert(rowsResult.snapshotItem(i));
	    if (row !== null) {
		rows.push(row);
	    }
	}

	if (rows.length !== ntotal) {
	    wwt.trace(`NOTE: skipping ${ntotal - rows.length} rows`);
	}
	return rows;
    }

    // Create the query. The ra, dec, and maxrad are in decimal degrees.
    // It is assumed that maxrad = [0, 180].
    //
    function mkspatial(ra, dec, maxrad) {

	let dmin = dec - maxrad;
	let dmax = dec + maxrad;
	if (dmin < -90) {
            dmin = -90.0;
	}
	if (dmax > 90) {
            dmax = 90.0;
	}

	var out = `(m.dec BETWEEN ${dmin} AND ${dmax}) AND `;

	const rad = maxrad / Math.cos(dec * Math.PI / 180);
	let rmin = ra - rad;
	let rmax = ra + rad;
	if ((rmin >= 0) && (rmax <= 360)) {
            out += `(m.ra BETWEEN ${rmin} AND ${rmax})`
	} else if (rmin < 0) {
            rmin = 360 + rmin;
            out += `((m.ra BETWEEN 0 AND ${rmax}) OR (m.ra BETWEEN ${rmin} AND 360))`;
	} else {
            rmax = rmax - 360;
            out += `((m.ra BETWEEN ${rmin} AND 360) OR (m.ra BETWEEN 0 AND ${rmax}))`;
	}

	// Add in the actual cone search now the positons have been filtered.
	//
	out += " AND udf_spherical_distance(m.ra,m.dec,";
	out += `${ra},${dec}) <= ${maxrad * 60}`;

	wwt.trace(` -- spatial filter: ${out}`);
	return out;
    }

    function mkquery(ra, dec, maxrad) {

	// The column names could be constructed from expectedCols
	const cols = ["m.name", "m.ra", "m.dec",
		      "m.err_ellipse_r0", "m.err_ellipse_r1",
		      "m.err_ellipse_ang",
		      "m.conf_flag", "m.extent_flag", "m.sat_src_flag",
		      "m.acis_num", "m.hrc_num",
		      "m.var_flag", "m.significance",
		      "m.flux_aper_b", "m.flux_aper_lolim_b",
		      "m.flux_aper_hilim_b",
		      "m.flux_aper_w", "m.flux_aper_lolim_w",
		      "m.flux_aper_hilim_w",
		      "m.nh_gal",
		      "m.hard_hm", "m.hard_hm_lolim", "m.hard_hm_hilim",
		      "m.hard_ms", "m.hard_ms_lolim", "m.hard_ms_hilim"
		     ];
	const colnames = cols.toString();
	const sfilt = mkspatial(ra, dec, maxrad);
	// const basename = "csc21";
	const basename = "csc_snapshot";
	return `SELECT ${colnames} FROM ${basename}.master_source m WHERE (${sfilt})`;
    }

    // Use the TAP service to return the same columns as for CSC 2.1
    // and earlier, but just without the "cone" part of the search.
    //
    // ra, dec, and maxrad are in decimal degrees.
    //
    function search(ra, dec, maxrad, success, failure) {

	const urldata = {REQUEST: "doQuery",
			 PHASE: "RUN",
			 FORMAT: "votable",
			 LANG: "ADQL",
			 QUERY: mkquery(ra, dec, maxrad)
			};
	const urlparams = new URLSearchParams(urldata);

	const req = new XMLHttpRequest();
	if (!req) {
	    wwt.etrace("Unable to create cone search");
	    return false;
	}

	wwt.startSpinner();
	req.addEventListener('load', () => {
	    wwt.stopSpinner();
	    if (req.status === 200) {
		wwt.trace(`-- cone search complete: ${ra} ${dec} ${maxrad}`);
		const json = votToJSON(expectedCols, convertRow,
				       req.responseXML);
		success(json);
	    } else {
		wwt.etrace(`-- unable to run cone search: ${ra} ${dec} ${maxrad} status=${req.status}`);
		failure(true);
	    }
	}, false);

	req.addEventListener('error', () => {
	    wwt.stopSpinner();
	    wwt.etrace(`-- error in cone search: ${ra} ${dec} ${maxrad}`);
	    failure(false);
	}, false);

	req.open('POST', TAP, true);
	req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	req.responseType = 'text/xml';
	req.send(urlparams);
	wwt.trace(` -- search URL: url=${TAP}`);
	wwt.trace(` -- search query: ${urldata.QUERY}`);
	return true;

    }

    // ra, dec, and maxrad are in decimal degrees.
    // Returns only ra and dec
    //
    function xmm_search(ra, dec, maxrad, success, failure) {

	const sfilt = mkspatial(ra, dec, maxrad);
	const query = `SELECT m.ra, m.dec from XMMSSC m WHERE (${sfilt})`;

	const urldata = {REQUEST: "doQuery",
			 PHASE: "RUN",
			 FORMAT: "votable",
			 LANG: "ADQL",
			 QUERY: mkquery(ra, dec, maxrad)
			};
	const urlparams = new URLSearchParams(urldata);

	const req = new XMLHttpRequest();
	if (!req) {
	    wwt.etrace("Unable to create cone search");
	    return false;
	}

	wwt.startSpinner();
	req.addEventListener('load', () => {
	    wwt.stopSpinner();
	    if (req.status === 200) {
		wwt.trace(`-- cone search complete: ${ra} ${dec} ${maxrad}`);
		const json = votToJSON(xmmExpectedCols, xmmConvertRow,
				       req.responseXML);
		success(json);
	    } else {
		wwt.etrace(`-- unable to run cone search: ${ra} ${dec} ${maxrad} status=${req.status}`);
		failure(true);
	    }
	}, false);

	req.addEventListener('error', () => {
	    wwt.stopSpinner();
	    wwt.etrace(`-- error in cone search: ${ra} ${dec} ${maxrad}`);
	    failure(false);
	}, false);

	req.open('POST', XMMTAP, true);
	req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	req.responseType = 'text/xml';
	req.send(urlparams);
	wwt.trace(` -- search URL: url=${TAP}`);
	wwt.trace(` -- search query: ${urldata.QUERY}`);
	return true;

    }

    return {
	coneSearch: search,
	xmmSearch: xmm_search,
    };

})();
