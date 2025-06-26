'use strict';

// We require that the wwt code is available (for access to the spinner).
//

const cone = (function () {

    // This is a version-specific end point. It is assumed to create
    // tables that follow version 1.2 of the VOTable specification.
    //
    const ConeSearch = "https://cda.cfa.harvard.edu/csc21scs/coneSearch";

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

    // Currently unused
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
	{name: "conf_flag", convert: convertToBool},
	{name: "extent_flag", convert: convertToBool},
	{name: "sat_src_flag", convert: convertToBool},
	{name: "flux_aper_b"},
	{name: "flux_aper_lolim_b"},
	{name: "flux_aper_hilim_b"},
	{name: "flux_aper_w"},
	{name: "flux_aper_lolim_w"},
	{name: "flux_aper_hilim_w"},
	{name: "significance", convert: convertToFloat},
	{name: "hard_hm", convert: convertToFloat},
	{name: "hard_hm_lolim", convert: convertToFloat},
	{name: "hard_hm_hilim", convert: convertToFloat},
	{name: "hard_ms", convert: convertToFloat},
	{name: "hard_ms_lolim", convert: convertToFloat},
	{name: "hard_ms_hilim", convert: convertToFloat},
	{name: "var_intra_index_b"},
	{name: "var_intra_index_w"},
	{name: "var_inter_index_b"},
	{name: "var_inter_index_w"},
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

    // Convert a VOTable to JSON. It is only intended to handle the
    // type of table returned by the CSC cone search interface, and so
    // is not a generic routine. It is also designed to convert the
    // response to match that used when the data was pre-compiled to
    // JSON.
    //
    // The return is an array of structures, which may be empty.
    //
    function votToJSON(xml) {

	const namesResult = xml.evaluate(namePath, xml, nsResolver,
					 XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
	for (let i = 0; i < namesResult.spanshotLength; i++) {
	    let got = namesResult.snapshotItem(i).nodeValue;
	    if (got !== expectedCols[i].name) {
		wwt.trace(`ERROR: column ${i} expected '${expectedCols[i].name}' got '${got}'`);
		return null;
	    }
	}
	if (namesResult.snapshotLength !== expectedCols.length) {
	    wwt.trace(`ERROR: expected ${expectedCols.length} columns but got '${namesResult.snapshotLength}'`);
	    return null;
	}

	let rows = [];
	const rowsResult = xml.evaluate(rowsPath, xml, nsResolver,
					XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
	const ntotal = rowsResult.snapshotLength;
	wwt.trace(`Found ${ntotal} rows in cone search`);
	for (let i = 0; i < ntotal; i++) {
	    let row = convertRow(rowsResult.snapshotItem(i));
	    if (row !== null) {
		rows.push(row);
	    }
	}

	if (rows.length !== ntotal) {
	    wwt.trace(`NOTE: skipping ${ntotal - rows.length} rows`);
	}
	return rows;
    }

    // Return the basic master-source properties for sources
    // close to the given location (all values in degrees).
    //
    // Send in the expected column names for the output objects.
    //


    // ARGH- using slightly-different columns to that returned by conesearch......


    function search(ra, dec, maxrad, success, failure) {

	const urldata = {RA: ra, DEC: dec, SR: maxrad, VERB: 2};
	const urlparams = new URLSearchParams(urldata);
	const url = ConeSearch + '?' + urlparams.toString();

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
		const json = votToJSON(req.responseXML);
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

	req.open('GET', url);
	req.responseType = 'text/xml';
	req.send();
	wwt.trace(` -- cone search: ${ra} ${dec} ${maxrad}`);
	return true;

    }

    return {
	coneSearch: search,
    };

})();
