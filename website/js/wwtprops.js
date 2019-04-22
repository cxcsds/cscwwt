'use strict';

//
// Display properties about a stack or a source.
//
// TODO: should have a package-local version of obi_map and
//       stack_name_map, as stack_name_map is currently a
//       global created by wwt_names.js and obi_map is
//       from wwt_obis.js. This needs cleaning up.
//
const wwtprops = (function () {

  // Convert RA (in degrees) into hour, minutes, seconds. The
  // return value is an object.
  //
  function raToTokens(ra) {
    const hours = ra /= 15.0;

    const rah = Math.floor(hours);
    const delta = 60.0 * (hours - rah);
    const ram = Math.floor(delta);
    let ras = 60.0 * (delta - ram);
    ras = Math.floor(ras * 100.0 + 0.5) / 100.0;

    return {hours: rah, minutes: ram, seconds: ras};
  }

  // Convert Dec (in degrees) into sign, degree, minutes, seconds. The
  // return value is an object.
  //
  function decToTokens(dec) {
    const sign = dec < 0.0 ? '-' : '+';

    const adec = Math.abs(dec);
    const decd = Math.floor(adec);
    const delta = 60.0 * (adec - decd);
    const decm = Math.floor(delta);
    let decs = 60.0 * (delta - decm);
    decs = Math.floor(decs * 10.0 + 0.5) / 10.0;

    return {sign: sign, degrees: decd, minutes: decm, seconds: decs};
  }

  // Convert RA (degrees) to HTML
  function raToHTML(ra) {
    const toks = raToTokens(ra);
    return toks.hours + '<sup>h</sup> ' +
      toks.minutes + '<sup>m</sup> ' +
      toks.seconds + '<sup>s</sup>';
  }

  // Convert Dec (degrees) to HTML
  function decToHTML(dec) {
    const toks = decToTokens(dec);
    return toks.sign +
      toks.degrees + '° ' +
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
  function addNEDNameLink(parent, name, active) {
    if (typeof active === 'undefined') { active = true; }

    const url = 'https://ned.ipac.caltech.edu/?q=byname&objname=' +
	  cleanQueryValue(name);

    const a = document.createElement('a');
    a.setAttribute('class', 'namelink');
    if (active) {
      a.setAttribute('target', '_blank');
      a.setAttribute('href', url);
    } else {
      a.setAttribute('href', '#');
    }
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
  function addSIMBADNameLink(parent, name, active) {
    if (typeof active === 'undefined') { active = true; }

    const url = 'http://simbad.u-strasbg.fr/simbad/sim-id?Ident=' +
	  cleanQueryValue(name);

    const a = document.createElement('a');
    a.setAttribute('class', 'namelink');
    if (active) {
      a.setAttribute('target', '_blank');
      a.setAttribute('href', url);
    } else {
      a.setAttribute('href', '#');
    }
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
  // If callback is null then no event listener is added.
  //
  function addSpanLink(parent, className, text, callback) {

    const span = document.createElement('span');
    span.setAttribute('class', className);

    const a = document.createElement('a');
    a.setAttribute('href', '#');
    if (callback !== null) {
      a.addEventListener('click', () => callback());
    }

    a.appendChild(document.createTextNode(text));
    span.appendChild(a);
    parent.appendChild(span);

  }

  // Add the location to the parent.
  //
  function addLocation(ra, dec, active) {
    if (typeof active === 'undefined') { active = true; }

    const div = mkDiv('coords');
    const raToks = raToTokens(ra);
    addText(div, 'α: ' + raToks.hours);
    div.appendChild(mkSup('h'));
    addText(div, ' ' + raToks.minutes);
    div.appendChild(mkSup('m'));
    addText(div, ' ' + raToks.seconds);
    div.appendChild(mkSup('s'));
    addText(div, ' δ: ' + decToHTML(dec) + ' (ICRS)');

    // clipboard
    const img = document.createElement('img');
    img.setAttribute('alt', 'Scissors (cut to clipboard)');
    img.setAttribute('class', 'clipboard');
    img.setAttribute('src', 'wwtimg/fa/cut.svg');
    const pos = ra + ' ' + dec;
    if (active) {
      img.addEventListener('click', () => wwt.copyToClipboard(pos));
    }
    div.appendChild(img);

    // TODO: add tooltip handler, although complicated since
    //       this has a limited lifespan (as can be deleted)

    return div;
  }

  // Sent the div for the main contents and the title sections
  //
  function addHideShowButton(parent, titleBar, active) {
    if (typeof active === 'undefined') { active = true; }

    const el = document.createElement('span');
    el.classList.add('switchable');
    el.classList.add('hideable');
    if (active) {
      el.addEventListener('click', () => {
	if (el.classList.contains('hideable')) {
	  parent.style.display = 'none';
	  el.classList.remove('hideable');
	  el.classList.add('showable');
	  titleBar.classList.remove('controlElementsShown');
	} else {
	  parent.style.display = 'block';
	  el.classList.remove('showable');
	  el.classList.add('hideable');
	  titleBar.classList.add('controlElementsShown');
	}
      });
    }
    return el;
  }

  // Add a button that closes the stack (this logic is handled by the
  // close callback).
  //
  function addCloseButton(close, active) {
    if (typeof active === 'undefined') { active = true; }

    const el = document.createElement('span');
    el.setAttribute('class', 'closable');
    if (active) {
      el.addEventListener('click', close);
    }
    return el;
  }

  // Create a "pop-up" window with details on the given stack.
  // This fills in the parent structure and determines whether this
  // is an "operational" or "inactive" version (for use or for display
  // in the help panel).
  //
  // TODO: can I give the number of sources IN THIS STACK?
  //       not really a good answer to this, as have number of
  //       detections, but not sources.
  //
  // parent - the div into which the contents should be placed;
  //          expected to be empty and have a class of stackinfopane
  // stack - object, stack details
  // stackVersion - null or the stack version
  // active - boolean, if true then links and handlers are used
  //
  function addStackInfoContents(parent, stack, stackVersion, active) {

    const controlElements = document.createElement('div');
    controlElements.classList.add('controlElements');
    controlElements.classList.add('controlElementsShown');

    parent.appendChild(controlElements);

    const name = document.createElement('span');
    name.setAttribute('class', 'title');
    addText(name, 'Stack: ' + stack.stackid);
    controlElements.appendChild(name);

    const mainDiv = mkDiv('main');

    controlElements.appendChild(addCloseButton(wwt.clearNearestStack, active));
    controlElements.appendChild(addHideShowButton(mainDiv, controlElements, active));

    parent.appendChild(mainDiv);

    const binfoDiv = mkDiv('basicinfo');
    mainDiv.appendChild(binfoDiv);

    addSpanLink(binfoDiv, 'clipboard',
		'Copy stack name to clipboard',
		active ? () => wwt.copyToClipboard(stack.stackid) : null);
    addSpanLink(binfoDiv, 'zoomto', 'Zoom to stack',
		active ? () => wwt.zoomToStack(stack.stackid) : null);

    mainDiv.appendChild(document.createElement('br'));

    const nDiv = mkDiv('not-semantic-name');
    mainDiv.appendChild(nDiv);

    // Location of stack
    //
    nDiv.appendChild(addLocation(stack.pos[0], stack.pos[1], active));

    // TEST SAMP: send stack event file
    //
    if (stackVersion !== null) {
      const sampDiv = mkDiv('samp');
      nDiv.appendChild(sampDiv);

      const sampImg = mkImg('Send via SAMP',
			    'wwtimg/glyphicons-223-share.png',
			    18, 18,
			    'usercontrol requires-samp');
      sampImg.id = 'export-samp-stkevt3';
      sampImg.addEventListener('click',
			       () => wwtsamp.sendStackEvt3(stack.stackid,
							   stackVersion));
      sampDiv.appendChild(sampImg);

      // TODO: tool-tip handling of this doesn't seem to work
      //       INVESTIGATE
      //
      const tooltip = 'Send the stack event3 file to ' +
	    'virtual-observatory applications (this can be slow).'
      addToolTip(sampDiv, 'export-samp-stkevt3-tooltip', tooltip);

      wwt.addToolTipHandler('export-samp-stkevt3');
    }

    // Target name (if available)
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
	addNEDNameLink(tgtDiv, names[0], active);
	addText(tgtDiv, ' ');
	addSIMBADNameLink(tgtDiv, names[0], active);
      } else {
	addText(tgtDiv, 'Target names: ');
	let i;
	for (i = 0; i < names.length; i++) {
          if (i > 0) {
	    addText(tgtDiv, ', ');
	  }
	  addText(tgtDiv, names[i] + ' ');
	  addNEDNameLink(tgtDiv, names[i], active);
	  addText(tgtDiv, ' ');
	  addSIMBADNameLink(tgtDiv, names[i], active);
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
	desc += ' and ';
	if (stack.status) {
	// Do not need the exact time, just the day
	var date = new Date(stack.lastmod * 1e3);
	desc += 'processing was completed on '
	+ dayName[date.getUTCDay()] + ', '
	+ date.getUTCDate().toString() + ' '
	+ monthName[date.getUTCMonth()] + ', '
	+ date.getUTCFullYear().toString()
	+ '.';
	} else {
	desc += 'has not been fully processed.';
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
    let i;
    for (i = 0; i < nobis; i++) {
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
    for (i = 0; i < nobis; i++) {
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
	if (active) {
	  a.setAttribute('target', '_blank');
	  a.setAttribute('href', url);
	} else {
	  a.setAttribute('href', '#');
	}
	addText(a, obsid.toString());
	seenDiv.appendChild(a);

	seen2[obsidstr] = 1;
      }
    }

    // border color depends on the processing status; this is an
    // attempt to subtly reinforce the color scheme
    //
    const bcol = stack.status ? 'gold' : 'grey';
    parent.style.borderColor = bcol;
    parent.style.display = 'block';
  }

  // Add the info for this stack to the main screen.
  //
  function addStackInfo(stack, stackEventVersions) {

    const parent = document.querySelector('#stackinfo');
    if (parent === null) {
      console.log('Internal error: no #stackinfo found');
      return;
    }

    let stackVersion = null;
    if ((stackEventVersions !== null) &&
	(stack.stackid in stackEventVersions.versions)) {
      stackVersion = stackEventVersions.versions[stack.stackid];
    } else {
      console.log('WARNING: No version found for stack=[' +
		  stack.stackid + ']');
    }

    addStackInfoContents(parent, stack, stackVersion, true);
  }

  // Add the info for this stack to the help pane; this is an
  // inactive pane.
  //
  function addStackInfoHelp(stack) {
    const parent = document.querySelector('#stackinfoexample');
    if (parent === null) {
      console.log('Internal error: no #stackinfo found');
      return;
    }

    addStackInfoContents(parent, stack, null, false);
  }

  // Hide the element, remove its children, and return it.
  // The selector is assumed to be valid, but if not null is returned
  // and a message is logged.
  //
  function clearElement(selector) {
    const el = document.querySelector(selector);
    if (el === null) {
      console.log('INTERNAL ERROR: unable to find ' + selector);
      return null;
    }
    el.style.display = 'none';
    removeChildren(el);
    return el;
  }

  function clearStackInfo() {
    clearElement('#stackinfo');
    // ignore the console warning from removing an unused handler
    //
    // FOR NOW remove this
    // wwt.removeToolTipHandler('export-samp-stkevt3');
  }

  // How to display the given "measured" or "calculated"
  // value, which may be null.
  //
  function textify(val) {
    if (val === null) {
      return 'N/A';
    }
    return val.toString();
  }

  function addRow(parent, lbl, val, labelclass) {

    const tr = document.createElement('tr');

    const ltd = document.createElement('td');
    if (typeof labelclass === 'undefined') {
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

    const confused = src.conf_flag !== 'FALSE';
    const saturated = src.sat_src_flag !== 'FALSE';

    if (confused || saturated) {
      let stext;
      if (confused) {
	stext = 'Source detection was affected by confusion';
	if (saturated) {
	  stext += ' and saturation';
	}
	stext += '.';
      } else {
	stext= 'Source detection was affected by saturation.';
      }
      addPara(parent, stext);
    }

    if (src.var_flag !== 'FALSE') {
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

    addRow(tbody, 'Number of ACIS observations', src.acis_num);
    addRow(tbody, 'Number of HRC observations', src.hrc_num);

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

    const parent = document.querySelector('#sourceinfo');
    if (parent === null) {
      console.log('Internal error: missing #sourceinfo');
      return;
    }

    const controlElements = document.createElement('div');
    controlElements.classList.add('controlElements');
    controlElements.classList.add('controlElementsShown');

    parent.appendChild(controlElements);

    const name = document.createElement('span');
    name.setAttribute('class', 'title');
    addText(name, 'Source: ' + src.name);
    controlElements.appendChild(name);

    const mainDiv = mkDiv('main');

    controlElements.appendChild(addCloseButton(wwt.clearNearestSource));
    controlElements.appendChild(addHideShowButton(mainDiv, controlElements));

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

    // Location of source
    //
    nDiv.appendChild(addLocation(src.ra, src.dec));

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

    parent.style.display = 'block';

    // The location of the tooltip isn't ideal here
    wwt.addToolTipHandler('export-samp-source');

  }

  function clearSourceInfo() {
    clearElement('#sourceinfo');
    wwt.removeToolTipHandler('export-samp-source');
  }

  // Convert a separation in degrees to a "nice" string.
  // Assume that the separation is <~ 20 arcminutes or so.
  //
  function mkSep(sep) {
    const asep = sep * 60.0;
    if (asep >= 1.0) {
      return asep.toFixed(1) + "'";
    } else {
      return (asep * 60.0).toFixed(1) + '"';
    }
  }

  function addNearestStackTable(stackAnnotations, stack0, neighbors,
				nearestFovs) {
    const n = neighbors.length;
    if (n === 0) { return; }

    const pane = document.querySelector('#neareststackinfo');
    if (pane === null) {
      console.log('INTERNAL ERROR: no #neareststackinfo');
      return;
    }

    const controlElements = document.createElement('div');
    controlElements.classList.add('controlElements');
    controlElements.classList.add('controlElementsShown');

    pane.appendChild(controlElements);

    const name = document.createElement('span');
    name.setAttribute('class', 'title');
    name.innerHTML = 'Nearest stack' + (n > 1 ? 's' : '');
    controlElements.appendChild(name);

    const main = mkDiv('main');

    const close = () => {
      clearNearestStackTable();

      // clear out the "nearest" stack outline; the easiest way is
      // to just change them but do not change the nearestFovs array,
      // since this will get done in a later call
      nearestFovs.forEach(fov => {
	if (fov.selected) { return; }
	fov.reset();
      });

    };
    controlElements.appendChild(addCloseButton(close));
    controlElements.appendChild(addHideShowButton(main, controlElements));

    pane.appendChild(main);

    const tbl = document.createElement('table');
    main.appendChild(tbl);

    const mkElem = (name, value) => {
      const el = document.createElement(name);
      el.innerHTML = value;
      return el;
    };

    const thead = document.createElement('thead');
    tbl.appendChild(thead);

    let trow = document.createElement('tr');
    thead.appendChild(trow);
    trow.appendChild(mkElem('th', 'Stack'));
    trow.appendChild(mkElem('th', 'Separation'));

    const tbody = document.createElement('tbody');
    tbl.appendChild(tbody);

    const mkStack = (stkid, fovs) => {
      const lnk = document.createElement('a');
      lnk.setAttribute('href', '#');
      addText(lnk, stkid);

      // The mouseleave event will not fire if a user clicks on a link,
      // so ensure we clean up.
      //
      lnk.addEventListener('click', () => {
	fovs.forEach(fov => fov.set_fill(false));
	wwt.processStackSelectionByName(stkid);
      });

      const td = document.createElement('td');
      td.appendChild(lnk);
      return td;
    }

    /*
     * It's not obvious that showing the selected source is helpful
    let trow = document.createElement('tr');
    tbody.appendChild(trow);
    trow.appendChild(mkStack(stack0.stackid));
    trow.appendChild(mkElem('td', '0.0'));
    */

    neighbors.forEach(d => {
      const sep = d[0];
      const stack = d[1];
      const fovs = stackAnnotations[stack.stackid];

      const trow = document.createElement('tr');
      tbody.appendChild(trow);

      trow.addEventListener('mouseenter', () => {
	fovs.forEach(fov => fov.set_fill(true));
	trow.classList.add('selected');
      });

      trow.addEventListener('mouseleave', () => {
	fovs.forEach(fov => fov.set_fill(false));
	trow.classList.remove('selected');
      });

      trow.appendChild(mkStack(stack.stackid, fovs));
      trow.appendChild(mkElem('td', mkSep(sep)));
    });

    pane.style.display = 'block';
  }

  function addNearestSourceTable(indexes, neighbors) {
    const n = neighbors.length;
    if (n === 0) { return; }

    const pane = document.querySelector('#nearestsourceinfo');
    if (pane === null) {
      console.log('INTERNAL ERROR: no #nearestsourceinfo');
      return;
    }

    const controlElements = document.createElement('div');
    controlElements.classList.add('controlElements');
    controlElements.classList.add('controlElementsShown');

    pane.appendChild(controlElements);

    const name = document.createElement('span');
    name.setAttribute('class', 'title');
    name.innerHTML = 'Nearest source' + (n > 1 ? 's' : '');
    controlElements.appendChild(name);

    const main = mkDiv('main');

    const close = () => {
      clearNearestSourceTable()

      // Are we going to be highlighting the nearby sources in any way?
      //
      /***
      nearestFovs.forEach(fov => {
	if (fov.selected) { return; }
	fov.reset();
      });
      ***/
    };
    controlElements.appendChild(addCloseButton(close));
    controlElements.appendChild(addHideShowButton(main, controlElements));

    pane.appendChild(main);

    const tbl = document.createElement('table');
    main.appendChild(tbl);

    const mkElem = (name, value) => {
      const el = document.createElement(name);
      el.innerHTML = value;
      return el;
    };

    const thead = document.createElement('thead');
    tbl.appendChild(thead);

    // TESTING OUT: let's see what works
    //
    let trow = document.createElement('tr');
    thead.appendChild(trow);
    trow.appendChild(mkElem('th', 'Source'));
    trow.appendChild(mkElem('th', 'Separation'));
    trow.appendChild(mkElem('th', 'Significance'));
    trow.appendChild(mkElem('th', 'Variable'));
    trow.appendChild(mkElem('th', 'flux band'));
    trow.appendChild(mkElem('th', 'flux'));

    const tbody = document.createElement('tbody');
    tbl.appendChild(tbody);

    const nameIdx = indexes.name;
    const sigIdx = indexes.significance;
    const varIdx = indexes.variability;
    const bandIdx = indexes.fluxband;
    const fluxIdx = indexes.flux;

    const mkSrcLink = (src, ra, dec, ann, origColor) => {
      const name = src[nameIdx];
      const lnk = document.createElement('a');
      lnk.setAttribute('href', '#');
      addText(lnk, name);

      // The mouseleave event will not fire if a user clicks on a link,
      // so ensure we clean up.
      //
      lnk.addEventListener('click', () => {
	ann.set_lineColor(origColor);
	wwt.processSourceSelection(ra, dec);
      });

      const td = document.createElement('td');
      td.appendChild(lnk);
      return td;
    }

    const mkButton = (flag) => {
      const btn = document.createElement('input');
      btn.setAttribute('type', 'checkbox');
      btn.checked = flag === 'TRUE';
      btn.disabled = true;

      const td = document.createElement('td');
      td.appendChild(btn);
      return td;
    }

    /*
     * TODO: include the central source
    let trow = document.createElement('tr');
    tbody.appendChild(trow);
    trow.appendChild(mkStack(stack0.stackid));
    trow.appendChild(mkElem('td', '0.0'));
    */

    neighbors.forEach(d => {
      const sep = d[0];
      const src = d[1].data;
      const ra = d[1].ra;
      const dec = d[1].dec;
      const ann = d[1].ann;

      const origColor = ann.get_lineColor();

      const trow = document.createElement('tr');
      tbody.appendChild(trow);

      trow.addEventListener('mouseenter', () => {
	ann.set_lineColor('orange');
	trow.classList.add('selected');
      });

      trow.addEventListener('mouseleave', () => {
	ann.set_lineColor(origColor);
	trow.classList.remove('selected');
      });

      trow.appendChild(mkSrcLink(src, ra, dec, ann, origColor));
      trow.appendChild(mkElem('td', mkSep(sep)));
      trow.appendChild(mkElem('td', src[sigIdx]));

      trow.appendChild(mkButton(src[varIdx]));

      trow.appendChild(mkElem('td', src[bandIdx]));
      trow.appendChild(mkElem('td', src[fluxIdx]));
    });

    pane.style.display = 'block';

  }

  function clearNearestStackTable() {
    clearElement('#neareststackinfo');
  }

  function clearNearestSourceTable() {
    clearElement('#nearestsourceinfo');
  }

  return { addStackInfo: addStackInfo,
	   addStackInfoHelp: addStackInfoHelp,
	   clearStackInfo: clearStackInfo,

	   addSourceInfo: addSourceInfo,
	   clearSourceInfo: clearSourceInfo,

	   addNearestStackTable: addNearestStackTable,
	   addNearestSourceTable: addNearestSourceTable,
	   clearNearestStackTable: clearNearestStackTable,
	   clearNearestSourceTable: clearNearestSourceTable,

	   raToTokens: raToTokens,
	   decToTokens: decToTokens,
	   raToHTML: raToHTML,
	   decToHTML: decToHTML

         };

})();
