//
// Display properties about a stack or a source.
//
const wwtprops = (function () {

    // Convert RA (in degrees) into hour, minutes, seconds. The
    // return value is an object.
    //
    function raToTokens(ra) {
        ra /= 15.0;

        const rah = Math.floor(ra);
        const delta = 60.0 * (ra - rah);
        const ram = Math.floor(delta);
        let ras = 60.0 * (delta - ram);
        ras = Math.floor(ras * 100.0 + 0.5) / 100.0;

	return {hours: rah, minutes: ram, seconds: ras};
    }

    // Convert Dec (in degrees) into sign, degree, minutes, seconds. The
    // return value is an object.
    //
    function decToTokens(dec) {

        const is_neg = dec < 0.0;
        let sign;
        if (is_neg) { sign = "-"; } else { sign = "+"; }

        dec = Math.abs(dec);
        const decd = Math.floor(dec);
        const delta = 60.0 * (dec - decd);
        const decm = Math.floor(delta);
        let decs = 60.0 * (delta - decm);
        decs = Math.floor(decs * 10.0 + 0.5) / 10.0;

	return {sign: sign, degrees: decd, minutes: decm, seconds: decs};
    }

    // Convert RA (degrees) to HTML
    function raToHTML(ra) {
	const toks = raToTokens(ra);
	return toks.hours + "<sup>h</sup> " +
	       toks.minutes + "<sup>m</sup> " +
	       toks.seconds + "<sup>s</sup>";
    }

    // Convert Dec (degrees) to HTML
    function decToHTML(dec) {
	const toks = decToTokens(dec);
	return toks.sign +
	       toks.degrees + "° " +
	       toks.minutes + "' " +
	       toks.seconds + '"';
    }

    // This is used in several modules
    //
    function cleanQueryValue(val) {
	return encodeURIComponent(val)
                .replace(/!/g, '%21')
                .replace(/'/g, '%27')
                .replace(/\(/g, '%28')
                .replace(/\)/g, '%29')
                .replace(/\*/g, '%2A')
	        .replace(/%0A/g, '\n');
    }

    // Add a link to NED searching on this name
    //
    function addNEDNameLink(parent, name) {

	const url = 'https://ned.ipac.caltech.edu/?q=byname&objname=' +
	    cleanQueryValue(name);

	const a = document.createElement('a');
	a.setAttribute('class', 'namelink');
	a.setAttribute('target', '_blank');
	a.setAttribute('href', url);
	addText(a, 'NED');

	parent.appendChild(a);
    }
    
    // hard-code a ~5" search radius
    //
    // could add incsrcs=1 as a term, but not clear what this
    // does
    //
    function addNEDCoordLink(parent, ra, dec) {

	const url = 'http://ned.ipac.caltech.edu/?q=nearposn&lon=' +
	    ra.toString() + 'd&lat=' + dec.toString() +
	    '&sr=0.0833&incsrcs=0&coordsys=Equatorial&equinox=J2000';

	const a = document.createElement('a');
	a.setAttribute('target', '_blank');
	a.setAttribute('href', url);
	addText(a, 'NED');

	parent.appendChild(a);
    }
    
    // Add a link to SIMBAD searching on this name
    //
    function addSIMBADNameLink(parent, name) {

	const url = 'http://simbad.u-strasbg.fr/simbad/sim-id?Ident=' +
	    cleanQueryValue(name);

	const a = document.createElement('a');
	a.setAttribute('class', 'namelink');
	a.setAttribute('target', '_blank');
	a.setAttribute('href', url);
	addText(a, 'SIMBAD');

	parent.appendChild(a);
    }

    // hard-code a ~5" search radius
    //
    function addSIMBADCoordLink(parent, ra, dec) {

	const url = 'http://simbad.u-strasbg.fr/simbad/sim-coo?Coord=' +
	    ra.toString() + '%20' + dec.toString() +
	    '&CooFrame=FK5&CooEpoch=2000&CooEqui=2000&CooDefinedFrames=none&Radius=5&Radius.unit=arcsec&submit=submit%20query&CoordList=';

	const a = document.createElement('a');
	a.setAttribute('target', '_blank');
	a.setAttribute('href', url);
	addText(a, 'SIMBAD');

	parent.appendChild(a);
    }

    // Based on
    // https://stackoverflow.com/questions/3955229/remove-all-child-elements-of-a-dom-node-in-javascript
    //
    function removeChildren(node) {
	while (node.firstChild) {
	    node.removeChild(node.firstChild);
	}
    }

    function mkDiv(className) {
	const div = document.createElement('div');
	div.setAttribute('class', className);
	return div;
    }

    function mkImg(alt, src, width, height, className) {
	const img = document.createElement('img');
	img.setAttribute('alt', alt);
	img.setAttribute('width', width);
	img.setAttribute('height', height);
	img.setAttribute('src', src);
	img.setAttribute('class', className);
	return img;
    }

    function mkSup(text) {
	const sub = document.createElement('sup');
	addText(sub, text);
	return sub;
    }

    // Add a text node to the parent
    //
    function addText(parent, text) {
	parent.appendChild(document.createTextNode(text));
    }
    

    // Create a paragraph with the contents, add it, and return
    // it (to allow furthor customization).
    //
    function addPara(parent, text) {
	const p = document.createElement('p');
	addText(p, text);
	parent.appendChild(p);
	return p;
    }

    // Add a tooltip para element.
    //
    function addToolTip(parent, id, text) {
	const p = addPara(parent, text);
	p.id = id;
	p.setAttribute('class', 'tooltip');
    }

    // Add a span item with the given class name which is a link
    // element with link text and the given call back when clicked.
    //
    function addSpanLink(parent, className, text, callback) {

	const span = document.createElement('span');
	span.setAttribute('class', className);

	const a = document.createElement('a');
	a.setAttribute('href', '#');
	a.addEventListener('click', () => callback());

	a.appendChild(document.createTextNode(text));
	span.appendChild(a);
	parent.appendChild(span);

    }
    
    // Create a "pop-up" window with details on the given stack.
    //
    // TODO: can I give the number of sources IN THIS STACK?
    //       not really a good answer to this, as have number of
    //       detections, but not sources.
    //
    /***

	No longer display the "completion" date of a stack so
	do not need these.

    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday",
                     "Thursday", "Friday", "Saturday"];
    const monthName = ["January", "February", "March", "April",
                       "May", "June", "July", "August", "September",
                       "October", "November", "December"];
    ***/

    function addStackInfo(stack, stackEventVersions) {

        var bcol;
        if (stack.status) { bcol = "gold"; }
        else { bcol = "grey"; }

        /***
        TODO: want to make bcol the same as the stack was, before it
        got changed to cyan. So can't ask the stack structure, unless
        we manually store it there as the "default" color
        ***/
        
        const parent = document.querySelector("#stackinfo");
	if (parent === null) {
	    console.log("Internal error: no #stackinfo found");
	    return;
	}

	const nameDiv = mkDiv('name');
	addText(nameDiv, "Stack: " + stack.stackid);
	parent.appendChild(nameDiv);

	const imgClose = mkImg('Close', 'wwtimg/glyphicons-208-remove.png',
			       18, 18, 'close');
	imgClose.id = 'closestackinfo';
	imgClose.addEventListener('click', () => wwt.clearNearestStack());
	parent.appendChild(imgClose);

	const mainDiv = mkDiv('main');
	parent.appendChild(mainDiv);

	const binfoDiv = mkDiv('basicinfo');
	mainDiv.appendChild(binfoDiv);

	addSpanLink(binfoDiv, 'clipboard',
		    'Copy stack name to clipboard',
		    () => wwt.copyToClipboard(stack.stackid));
	addSpanLink(binfoDiv, 'zoomto', 'Zoom to stack',
		    () => wwt.zoomToStack(stack.stackid));

	mainDiv.appendChild(document.createElement('br'));

	const nDiv = mkDiv('not-semantic-name');
	mainDiv.appendChild(nDiv);

	// Location of stack
	//
	const raToks = raToTokens(stack.pos[0]);

	const locDiv = mkDiv('coords');
	addText(locDiv, "α: " + raToks.hours);
	locDiv.appendChild(mkSup('h'));
	addText(locDiv, ' ' + raToks.minutes);
	locDiv.appendChild(mkSup('m'));
	addText(locDiv, ' ' + raToks.seconds);
	locDiv.appendChild(mkSup('s'));
	addText(locDiv, " δ: "  + decToHTML(stack.pos[1]) + " (ICRS)");
	nDiv.appendChild(locDiv);

	// TEST SAMP: send stack event file
	//
	if ((stackEventVersions !== null) &&
	    (stack.stackid in stackEventVersions.versions)) {
	    const stackVer = stackEventVersions.versions[stack.stackid];
	    console.log("FOUND STACK VERSION: [" + stackVer.toString() + "]");

	    const sampDiv = mkDiv('samp');
	    nDiv.appendChild(sampDiv);

	    const sampImg = mkImg('Send via SAMP',
				  'wwtimg/glyphicons-223-share.png',
				  18, 18,
				  'usercontrol requires-samp');
	    sampImg.id = 'export-samp-stkevt3';
	    sampImg.addEventListener('click',
				     () => wwtsamp.sendStackEvt3(stack.stackid,
								 stackVer));
	    sampDiv.appendChild(sampImg);

	    // TODO: tool-tip handling of this doesn't seem to work
	    //       INVESTIGATE
	    //
	    const tooltip = 'Send the stack event3 file to ' +
		'virtual-observatory applications (this can be slow).'
	    addToolTip(sampDiv, 'export-samp-stkevt3-tooltip', tooltip);

	    wwt.addToolTipHandler("export-samp-stkevt3");
	}

	// Target name (if available)
	//
        // TODO: should have a package-local version of obi_map and
        //       stack_name_map, as stack_name_map is currently a
	//       global created by wwt_names.js and obi_map is
	//       from wwt_obis.js
        //
        // Note that a stack may be missing field names for technical
        // reasons.
        //
        if (stack.stackid in stack_name_map) {
	    const tgtDiv = mkDiv('targetname');
	    mainDiv.appendChild(tgtDiv);

            const names = stack_name_map[stack.stackid];

            if (names.length === 1) {
		addText(tgtDiv, 'Target name: ' + names[0] + ' ');
		addNEDNameLink(tgtDiv, names[0]);
		addText(tgtDiv, ' ');
		addSIMBADNameLink(tgtDiv, names[0]);
            } else {
		addText(tgtDiv, 'Target names: ');
                for (var i = 0; i < names.length; i++) {
                    if (i > 0) {
			addText(tgtDiv, ', ');
		    }
		    addText(tgtDiv, names[i] + ' ');
		    addNEDNameLink(tgtDiv, names[i]);
		    addText(tgtDiv, ' ');
		    addSIMBADNameLink(tgtDiv, names[i]);
                }
            }
        }

	// Description
	//
	const descPara = document.createElement('p');
	descPara.setAttribute('class', 'description');

	// No longer bother with information on when the
	// stack was completed.
	//
	/***
        var desc = stack.description;
        if (desc.endsWith('.')) {
            desc = desc.substr(0, desc.length - 1);
        }
        desc += " and ";
        if (stack.status) {
            // Do not need the exact time, just the day
            var date = new Date(stack.lastmod * 1e3);
            desc += "processing was completed on "
                + dayName[date.getUTCDay()] + ", "
                + date.getUTCDate().toString() + " "
                + monthName[date.getUTCMonth()] + ", "
                + date.getUTCFullYear().toString()
                + ".";
        } else {
            desc += "has not been fully processed.";
        }
        
	addText(descPara, desc);
	***/

	addText(descPara, stack.description);

	mainDiv.appendChild(descPara);

	// What obis are in this stack?
	//
        const obis = obi_map[stack.stackid];
	const nobis = obis.length;

	// Since hide the few multi-obi datasets (i.e. treat as a
	// single ObsId), need to do this before can work out
	// whether a singular or plural header is needed.
	//
	// This logic gets repeated, but I don't want to spend time
	// avoiding this repition just yet.
	//
	// Do we have any multi-obi observations that are in a
	// single OBSID stack, or are they always in multi-OBSID
	// stacks (ie how much of this is actually needed)?
	//
        const seen = Object.create(null);
        for (var i = 0; i < nobis; i++) {
            const obsidstr = obis[i].substring(0, 5);
            seen[obsidstr] = 1;
        }

	const nseen = Object.keys(seen).length;
	const seenDiv = mkDiv('stack-obsids');
	mainDiv.appendChild(seenDiv);

	addText(seenDiv, 'Stack observation');
	if (nseen > 1) {
	    addText(seenDiv, 's');
	}

	addText(seenDiv, ': ');

        const seen2 = Object.create(null);
        let first = true;
        for (var i = 0; i < nobis; i++) {
            const obsidstr = obis[i].substring(0, 5);
            if (!(obsidstr in seen2)) {
                const obsid = parseInt(obsidstr);
                if (first) {
		    first = false;
		} else {
		    addText(seenDiv, ', ');
		}
		
		const url = 'http://cda.cfa.harvard.edu/chaser/' +
		    'startViewer.do?menuItem=details&obsid=' + obsid;

		const a = document.createElement('a');
		a.setAttribute('target', '_blank');
		a.setAttribute('href', url);
		addText(a, obsid.toString());
		seenDiv.appendChild(a);

                seen2[obsidstr] = 1;
            }
        }

        // border color depends on the processing status; this is an
        // attempt to subtly reinforce the color scheme
        //
        parent.style.borderColor = bcol;
        parent.style.display = "block";
    }

    function clearStackInfo() {
        const parent = document.querySelector("#stackinfo");
	if (parent === null) {
	    console.log("Internal error: no #stackinfo");
	    return;
	}
        parent.style.display = "none";
	removeChildren(parent);

	// ignore the console warning from removing an unused handler
	//
	// FOR NOW remove this
	// wwt.removeToolTipHandler("export-samp-stkevt3");
    }

    // How to display the given "measured" or "calculated"
    // value, which may be null.
    //
    function textify(val) {
	if (val === null) {
	    return "N/A";
	}
	return val.toString();
    }


    function addRow(parent, lbl, val, labelclass) {

	const tr = document.createElement('tr');

	const ltd = document.createElement('td');
	if (typeof labelclass === "undefined") {
	    ltd.setAttribute('class', 'label');
	} else {
	    ltd.setAttribute('class', labelclass);
	}
	ltd.innerHTML = lbl;

	const vtd = document.createElement('td');
	vtd.setAttribute('class', 'value');
	vtd.innerText = textify(val);

	parent.appendChild(tr);
	tr.appendChild(ltd);
	tr.appendChild(vtd);
    }

    function addLinkRow(parent, url, lbl, val) {

	const tr = document.createElement('tr');

	const ltd = document.createElement('td');
	ltd.setAttribute('class', 'label');

	const a = document.createElement('a');
	a.setAttribute('target', '_blank');
	a.setAttribute('href', url);
	a.innerText = lbl;

	ltd.appendChild(a);

	const vtd = document.createElement('td');
	vtd.setAttribute('class', 'value');
	vtd.innerText = textify(val);

	parent.appendChild(tr);
	tr.appendChild(ltd);
	tr.appendChild(vtd);
    }

    function addErrorRows(parent, url, lbl, val, loval, hival) {
	addLinkRow(parent, url, lbl, val);
	addRow(parent, 'Lower confidence limit', loval, 'labellimit');
	addRow(parent, 'Upper confidence limit', hival, 'labellimit');
    }

    // Add the table of source properties (if they exist) to the
    // given element.
    //
    function addSourceProperties(parent, src) {
	// Do not show error radius if source properties not
	// finalised (the values don't seem to match up, so may
	// not be including the correct data).
	//
	if (src.nh_gal === null) {
	    const noDataPara = document.createElement('p');
	    addText(noDataPara,
		    'Source properties have not been calculated for ' +
		    'this source yet.');
	    parent.appendChild(noDataPara);
	    return;
	}

	const confused = src.conf_flag != "FALSE";
	const saturated = src.sat_src_flag != "FALSE";

	if (confused || saturated) {
	    let stext;
	    if (confused) {
		stext = "Source detection was affected by confusion";
		if (saturated) {
		    stext += " and saturation";
		}
		stext += ".";
	    } else {
		stext= "Source detection was affected by saturation.";
	    }
	    addPara(parent, stext);
	}

	if (src.var_flag != "FALSE") {
	    addPara(parent,
		    'Source is variable (within or between observations).');
	}

	// The table of source properties.
	//
	const table = document.createElement('table');
	table.setAttribute('class', 'srcprop');
	parent.appendChild(table);

	const tbody = document.createElement('tbody');
	table.appendChild(tbody);

	// Only include the angle if the ellipse is not circular.
	//
	let errlbl = src.err_ellipse_r0.toString() + '" by ' +
	    src.err_ellipse_r1.toString() + '"';
	if (src.err_ellipse_ang !== 0) {
	    errlbl += ' at ' + src.err_ellipse_ang + '°';
	}

	addLinkRow(tbody, 'columns/positions.html',
		   '95% confidence position error ellipse',
		   errlbl);
		
	// TODO: should we convert to the appropriate power of 10,
	//       or always leave as 10^20?
	//
	addRow(tbody,
	       'Galactic n<sub>H</sub> column density',
	       src.nh_gal + ' × 10²⁰ cm⁻²');

	if (src.fluxband !== '') {
	    addErrorRows(tbody,
			 'columns/fluxes.html#apphotflux',
			 'Aperture-corrected flux (' + src.fluxband +
			 ' band)',
		   	 src.flux + ' erg cm⁻² s⁻¹',
			 src.flux_lolim,
			 src.flux_hilim);
	}

	addLinkRow(tbody, 'columns/significance.html',
		   'Source significance (S/N)',
		   src.significance);

	// wait for Joe's confirmation that this flag is valid
	//
	// addLinkRow(tbody, 'columns/variability.html',
	//            'Source is variable (within or between ' +
	//            'observations)',
	//            src.var_flag);


	// Only show the hardness ratio if it is not all null (perhaps
	// we should only display it if we have a measured value).
	//
	if ((src.hard_hm !== null) ||
	    (src.hard_hm_lolim !== null) ||
	    (src.hard_hm_hilim !== null)) {
	    addErrorRows(tbody,
			 'columns/spectral_properties.html',
			 'Hard/Medium band hardness ratio',
			 src.hard_hm,
			 src.hard_hm_lolim,
			 src.hard_hm_hilim);
	}

	if ((src.hard_ms !== null) ||
	    (src.hard_ms_lolim !== null) ||
	    (src.hard_ms_hilim !== null)) {
	    addErrorRows(tbody,
			 'columns/spectral_properties.html',
			 'Medium/Soft band hardness ratio',
			 src.hard_ms,
			 src.hard_ms_lolim,
			 src.hard_ms_hilim);
	}

	addRow(tbody, "Number of ACIS observations", src.acis_num);
	addRow(tbody, "Number of HRC observations", src.hrc_num);

	// add a warning about the values
	const warnPara = document.createElement('p');
	addText(warnPara, 'Please ');
	
	const strong = document.createElement('strong');
	addText(strong, 'review');
	warnPara.appendChild(strong);

	addText(warnPara, ' the current ');

	const a = document.createElement('a');
	a.setAttribute('target', '_blank');
	a.setAttribute('href', 'caveats.html#prelim');
	addText(a, 'caveats');
	warnPara.appendChild(a);

	addText(warnPara, ' for source properties in CSC 2.0.');
	parent.appendChild(warnPara);
    }


    // srcid is the position of the source within catalogData
    //
    // FOR NOW, use nh_gal as an indicator of whether we have
    // source properties or not. Should be a better way.
    //
    function addSourceInfo(src) {

        const parent = document.querySelector("#sourceinfo");
	if (parent === null) {
	    console.log("Internal error: missing #sourceinfo");
	    return;
	}

	const nameDiv = mkDiv('name');
	addText(nameDiv, 'Source: ' + src.name);
	parent.appendChild(nameDiv);

	const imgClose = mkImg('Close', 'wwtimg/glyphicons-208-remove.png',
			       18, 18, 'close');
	imgClose.id = 'closesourceinfo';
	imgClose.addEventListener('click', () => wwt.clearNearestSource());
	parent.appendChild(imgClose);

	const mainDiv = mkDiv('main');
	parent.appendChild(mainDiv);

	const binfoDiv = mkDiv('basicinfo');
	mainDiv.appendChild(binfoDiv);

	addSpanLink(binfoDiv, 'clipboard',
		    'Copy source name to clipboard',
		    () => wwt.copyToClipboard(src.name));

	const span = document.createElement('span');
	span.setAttribute('class', 'search');
	addText(span, 'Search nearby: ');
	addNEDCoordLink(span, src.ra, src.dec);
	addText(span, ' or ');
	addSIMBADCoordLink(span, src.ra, src.dec);

	binfoDiv.appendChild(span);

	addSpanLink(binfoDiv, 'zoomto', 'Zoom to source',
		    () => wwt.zoomToSource(src.name));

	mainDiv.appendChild(document.createElement('br'));

	const nDiv = mkDiv('not-semantic-name');
	mainDiv.appendChild(nDiv);

	// Location of stack
	//
	const raToks = raToTokens(src.ra);

	const locDiv = mkDiv('coords');
	addText(locDiv, "α: " + raToks.hours);
	locDiv.appendChild(mkSup('h'));
	addText(locDiv, ' ' + raToks.minutes);
	locDiv.appendChild(mkSup('m'));
	addText(locDiv, ' ' + raToks.seconds);
	locDiv.appendChild(mkSup('s'));
	addText(locDiv, " δ: "  + decToHTML(src.dec) + " (ICRS)");
	nDiv.appendChild(locDiv);

	// TODO: this should only be done for sources we have
	//       processed (e.g. have a nH), shouldn't it?
	//
	const sampDiv = mkDiv('samp');
	nDiv.appendChild(sampDiv);

	const sampImg = mkImg('Send via SAMP',
			      'wwtimg/glyphicons-223-share.png',
			      18, 18,
			      'usercontrol requires-samp');
	    sampImg.id = 'export-samp-source';
	    sampImg.addEventListener('click',
				     () => wwtsamp.sendSourcePropertiesName(src.name));
	    sampDiv.appendChild(sampImg);

	    // TODO: tool-tip handling of this doesn't seem to work
	    //       INVESTIGATE <is this true here?>
	    //
	    const tooltip = 'Send the source properties to ' +
	        'virtual-observatory applications.';
	    addToolTip(sampDiv, 'export-samp-source-tooltip', tooltip);

	// finished adding to nDiv

	addSourceProperties(mainDiv, src);

        parent.style.display = "block";

	// The location of the tooltip isn't ideal here
	wwt.addToolTipHandler("export-samp-source");

    }

    function clearSourceInfo() {
        const host = document.querySelector("#sourceinfo");
        host.style.display = "none";
        host.innerHTML = '';

	wwt.removeToolTipHandler("export-samp-source");
    }


    return { addStackInfo: addStackInfo,
	     clearStackInfo: clearStackInfo,

	     addSourceInfo: addSourceInfo,
	     clearSourceInfo: clearSourceInfo,

	     raToHTML: raToHTML,
	     decToHTML: decToHTML

           };
    
})();
