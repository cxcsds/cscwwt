'use strict';

/* global alert, CustomEvent */
/* global draggable */
/* global wwt, wwtsamp, wwtplots */

//
// Display properties about a stack or a source.
//
const wwtprops = (function () {

  // Argh: this is old code that I'm trying to resurrect.
  //
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday",
		   "Thursday", "Friday", "Saturday"];
  const monthName = ["January", "February", "March", "April",
		     "May", "June", "July", "August", "September",
		     "October", "November", "December"];

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
    return `${toks.hours}<sup>h</sup> ${toks.minutes}<sup>m</sup> ${toks.seconds}<sup>s</sup>`;
  }

  // Convert Dec (degrees) to HTML
  function decToHTML(dec) {
    const toks = decToTokens(dec);
    return `${toks.sign}${toks.degrees}° ${toks.minutes}' ${toks.seconds}"`; // comment for emacs: ' ;
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
  function addNEDCoordLink(parent, ra, dec, active) {
    if (typeof active === 'undefined') { active = true; }

    const url = 'http://ned.ipac.caltech.edu/?q=nearposn&lon=' +
	  ra.toString() + 'd&lat=' + dec.toString() +
	  '&sr=0.0833&incsrcs=0&coordsys=Equatorial&equinox=J2000';

    const a = document.createElement('a');
    if (active) {
      a.setAttribute('target', '_blank');
      a.setAttribute('href', url);
    } else {
      a.setAttribute('href', '#');
    }
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
  function addSIMBADCoordLink(parent, ra, dec, active) {
    if (typeof active === 'undefined') { active = true; }

    const url = 'http://simbad.u-strasbg.fr/simbad/sim-coo?Coord=' +
	  ra.toString() + '%20' + dec.toString() +
	  '&CooFrame=FK5&CooEpoch=2000&CooEqui=2000&CooDefinedFrames=none&Radius=5&Radius.unit=arcsec&submit=submit%20query&CoordList=';

    const a = document.createElement('a');
    if (active) {
      a.setAttribute('target', '_blank');
      a.setAttribute('href', url);
    } else {
      a.setAttribute('href', '#');
    }
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

  // width and height can be null
  // className can contain spaces (i.e. multiple classes)
  function mkImg(alt, src, width, height, className) {
    const img = document.createElement('img');
    img.setAttribute('alt', alt);
    if (width !== null) { img.setAttribute('width', width); }
    if (height !== null) { img.setAttribute('height', height); }
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
      a.addEventListener('click', (event) => callback(event), false);
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
    addText(div, `α: ${raToks.hours}`);
    div.appendChild(mkSup('h'));
    addText(div, ` ${raToks.minutes}`);
    div.appendChild(mkSup('m'));
    addText(div, ` ${raToks.seconds}`);
    div.appendChild(mkSup('s'));
    addText(div, ` δ: ${decToHTML(dec)} (ICRS)`);

    // clipboard
    const img = mkImg('Scissors (cut to clipboard)',
		      'wwtimg/fa/cut.svg',
		      null, null,
		      'icon');
    if (active) {
      img.addEventListener('click',
			   (event) => wwt.copyCoordinatesToClipboard(event, ra, dec),
			   false);
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

    const span = document.createElement('span');
    span.classList.add('switchable');
    span.classList.add('hideable');

    const hideImg = mkImg('Hide', 'wwtimg/fa/chevron-circle-down.svg',
			  null, null, 'icon');
    const showImg = mkImg('Show', 'wwtimg/fa/chevron-circle-up.svg',
			  null, null, 'icon');
    showImg.style.display = 'none';
    span.appendChild(hideImg);
    span.appendChild(showImg);

    if (active) {
      span.addEventListener('click', () => {
	if (span.classList.contains('hideable')) {
	  parent.style.display = 'none';
	  span.classList.remove('hideable');
	  span.classList.add('showable');
	  titleBar.classList.remove('controlElementsShown');

	  hideImg.style.display = 'none';
	  showImg.style.display = 'block';
	} else {
	  parent.style.display = 'block';
	  span.classList.remove('showable');
	  span.classList.add('hideable');
	  titleBar.classList.add('controlElementsShown');

	  hideImg.style.display = 'block';
	  showImg.style.display = 'none';
	}
      }, false);
    }

    return span;
  }

  // Add a button that closes the stack (this logic is handled by the
  // close callback).
  //
  function addCloseButton(close, active) {
    if (typeof active === 'undefined') { active = true; }

    const el = document.createElement('span');
    el.setAttribute('class', 'closable');
    if (active) {
      el.addEventListener('click', close, false);
    }

    const img = mkImg('Close icon (circle with a times symbol in it)',
		      'wwtimg/fa/times-circle.svg',
		      null, null,
		      'icon');
    el.appendChild(img);
    return el;
  }

  // closedown is the function to call when the close button has been
  // clicked, and it has no arguments.
  //
  // It returns div class='main'.
  //
  function addControlElements(parent, title, closedown, active) {
    const controlElements = document.createElement('div');
    controlElements.classList.add('controlElements');
    controlElements.classList.add('controlElementsShown');

    parent.appendChild(controlElements);

    const name = document.createElement('span');
    name.setAttribute('class', 'title');
    addText(name, title);
    controlElements.appendChild(name);

    const mainDiv = mkDiv('main');

    controlElements.appendChild(addCloseButton(closedown, active));
    controlElements.appendChild(addHideShowButton(mainDiv, controlElements, active));

    parent.appendChild(mainDiv);
    return mainDiv;
  }

  // Add in the 'Export' button and options for SAMP/clipboard.
  //
  //   active is true if this is the live (not help) version
  //   mtype is the mtype of the ADQL query
  //   buttonId is the id for the button
  //   clientListId is the id for the drop-down menu (SAMP client list)
  //   whatEl is the element describing "what" is being exported
  //     (if it has an id then the "what:" text label is linked to it)
  //   selected should have a target field (it is updated by the client
  //     list when a user changes the entry); only used if active is true
  //
  // Returns the div containing everything, the target-list element,
  // and the button as an object (fields are 'container', 'list', 'button').
  //
  function createSAMPExport(active, mtype, buttonId, clientListId,
			    whatEl, selected) {
    const div = document.createElement('div');
    div.setAttribute('class', 'samp-export-list');
    div.setAttribute('data-samp-mtype', mtype);
    div.setAttribute('data-samp-clientlist', `#${clientListId}`);

    const btn = document.createElement('button');
    btn.id = buttonId;
    btn.setAttribute('class', 'button');
    btn.setAttribute('type', 'button');
    addText(btn, 'Export ...');

    const lbl1 = document.createElement('label');
    if (whatEl.id !== '') {
      lbl1.setAttribute('for', whatEl.id);
    }
    addText(lbl1, 'What:');

    const clientList = createSAMPClientList(active, clientListId, mtype, false);

    const lbl2 = document.createElement('label');
    lbl2.setAttribute('for', clientList.id);
    addText(lbl2, 'Where:');

    const bdiv = document.createElement('div');
    bdiv.appendChild(btn);

    const sdiv = document.createElement('div');
    sdiv.setAttribute('class', 'grid-2-cols');

    // Need to wrap in div do can use with grid CSS
    const addWrap = el => {
      const wdiv = document.createElement('div');
      wdiv.appendChild(el);
      sdiv.appendChild(wdiv);
    };

    addWrap(lbl1);
    addWrap(whatEl);

    addWrap(lbl2);
    addWrap(clientList);

    div.appendChild(bdiv);
    div.appendChild(sdiv);

    if (active) {
      // NOTE:
      //
      // If TARGET_FIND is selected then the target is still changed,
      // even though downstream code will treat this as a no-op. This
      // is because the registration and then UI updates to include the
      // clients can take a significant amount of time, during which
      // the user can select the export button. Without changing the
      // field then this would likely cause the TARGET_CLIPBOARD
      // action to fire, which is a bit confusing (seen during user
      // testing). It is also confusing to have the button do nothing,
      // but possibly less confusing. One option would be to disable
      // the button until the update has been done, but leave that
      // for now as tricky to get right.
      //
      clientList.addEventListener('change', ev => {
	selected.target = ev.target.value;
	if (ev.target.value === wwtsamp.TARGET_FIND) {
	  wwtsamp.register(); // This is an asynchronous action
	}
      }, false);
    }

    return {container: div, list: clientList, button: btn};
  }

  // Add in the SAMP export button for the stack info panel.
  //
  // versionTable is expected to contain fielts which are either
  // numbers or null, and refer to the filetypes available to
  // download (and must match the value field of the opts array
  // below).
  //
  // We do not add anything if there's no data to export.
  //
  function addSendStackEvtFile(active, parent, stack, versionTable) {
    const clientListId = 'export-clientlist-stkevt';
    const mtype = 'image.load.fits';

    // What is being exported?
    //
    const band = stack.stackid.startsWith('acis') ? 'broad' : 'wide';

    const opts = [{value: 'stkevt3', label: 'Stack event file'},
		  {value: 'stkecorrimg',
		   label: `Stack ${band}-band exposure-corrected image`},
		  {value: 'stkexpmap',
		   label: `Stack ${band}-band exposure map`},
		  {value: 'stkbkgimg',
		   label: `Stack ${band}-band background image`},
		  {value: 'sensity',
		   label: `Stack ${band}-band sensitivity image`}];

    const toShow = [];
    opts.forEach(opt => {
      const ver = versionTable[opt.value];
      if ((typeof ver === 'undefined') || (ver === null)) { return; }
      toShow.push(opt);
    });

    if (toShow.length === 0) { return; }

    // What information is tracked?
    //
    const selected = {target: wwtsamp.TARGET_CLIPBOARD, choice: null};

    let whatEl;
    if (toShow.length > 1) {
      whatEl = document.createElement('select');
      whatEl.id = 'export-stack-choice';
      whatEl.setAttribute('name', whatEl.id);
      whatEl.setAttribute('class', 'button');
      toShow.forEach(opt => addOption(whatEl, opt.value, opt.label));
      selected.choice = toShow[0].value;
    } else {
      whatEl = document.createElement('span');
      addText(whatEl, toShow[0].label);
      selected.choice = toShow[0].value;
    }

    const els = createSAMPExport(active, mtype, 'export-samp-stkevt',
				 clientListId, whatEl, selected);

    if (active) {
      if (whatEl.id !== '') {
	whatEl.addEventListener('change', ev => {
	  selected.choice = ev.target.value;
	}, false);
      }

      els.button.addEventListener('click', (event) => {
	console.log(`Chosen option: ${selected.choice}`);
	console.log(`Chosen target: ${selected.target}`);
	let send = null;
	if (selected.choice === 'stkevt3') {
	  send = wwtsamp.sendStackEvt3;
	} else if (selected.choice === 'stkecorrimg') {
	  send = wwtsamp.sendStackEcorrImg;
	} else if (selected.choice === 'stkexpmap') {
	  send = wwtsamp.sendStackExpMap;
	} else if (selected.choice === 'stkbkgimg') {
	  send = wwtsamp.sendStackBkgImg;
	} else if (selected.choice === 'sensity') {
	  send = wwtsamp.sendStackSensity;
	}

	if (send !== null) {
	  send(event, stack.stackid, versionTable[selected.choice],
	       selected.target);
	} else {
	  console.log(`INTERNAL ERROR: unsupported option ${selected.choice}`);
	}

      }, false);
    }

    parent.appendChild(els.container);
  }

  // Add in the SAMP export button for the single-source panel.
  //
  function addSendSourcePropertiesName(active, parent, src) {
    const clientListId = 'export-clientlist-sourcename';
    const mtype = 'table.load.votable';

    // What is being exported?
    //
    const whatEl = document.createElement('span');
    addText(whatEl, 'All master-source properties');

    // What information is tracked?
    //
    const selected = {target: wwtsamp.TARGET_CLIPBOARD};

    const els = createSAMPExport(active, mtype, 'export-samp-sourcename',
				 clientListId, whatEl, selected);

    if (active) {
      els.button.addEventListener('click', (event) => {
	console.log(`Chosen target: ${selected.target}`);
	wwtsamp.sendSourcePropertiesName(event, selected.target, src.name);
      }, false);
    }

    parent.appendChild(els.container);
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
  // versionTable - fields with version numbers (or null)
  // active - boolean, if true then links and handlers are used
  //
  // The text depends on the available data, which depends on the
  // catalog version (2.0 vs 2.1).
  //
  function addStackInfoContents(parent, stack, versionTable, active) {

    parent.setAttribute('data-stackid', stack.stackid);
    const mainDiv = addControlElements(parent,
				       `Stack: ${stack.stackid}`,
				       wwt.clearNearestStack,
				       active);

    const binfoDiv = mkDiv('basicinfo');
    mainDiv.appendChild(binfoDiv);

    addSpanLink(binfoDiv, 'clipboard',
		'Copy stack name to clipboard',
		active ? (event) => wwt.copyToClipboard(event, stack.stackid) : null);
    addSpanLink(binfoDiv, 'zoomto', 'Zoom to stack',
		active ? () => wwt.zoomToStack(stack.stackid) : null);

    mainDiv.appendChild(document.createElement('br'));

    const nDiv = mkDiv('not-semantic-name');
    mainDiv.appendChild(nDiv);

    // Location of stack
    //
    nDiv.appendChild(addLocation(stack.pos[0], stack.pos[1], active));

    // Target name
    //
    const tgtDiv = mkDiv('targetname');
    mainDiv.appendChild(tgtDiv);

    const names = stack.names;

    if (names.length === 1) {
      addText(tgtDiv, `Target name: ${names[0]} `);
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

    // Description
    //
    const descPara = document.createElement('p');
    descPara.setAttribute('class', 'description');

    // Do we want to note the completed date?
    //
    var desc = stack.description;
    if (wwt.getVersion() === "2.1") {
      if (stack.status) {
        // Do not need the exact time, just the day
        var date = new Date(stack.lastmod * 1e3);
        desc += ' The stack was processed on '
             + dayName[date.getUTCDay()] + ', '
             + date.getUTCDate().toString() + ' '
             + monthName[date.getUTCMonth()] + ', '
             + date.getUTCFullYear().toString()
             + '.';
      } else {
        desc += ' The stack has not been fully processed.';
      }
    }

    addText(descPara, desc);

    mainDiv.appendChild(descPara);

    // What obis are in this stack?
    //
    const obis = stack.obis;
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

    // Do we have CSC 2.1 "new obsids" data?
    //
    let new_obis = [];
    if (typeof stack.new_obis !== "undefined") {
        new_obis = stack.new_obis;
    }

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

        // If this is new in 2.1 note this
        //
        if (new_obis.indexOf(obis[i]) !== -1) {
           addText(seenDiv, " [new]");
        }

	seen2[obsidstr] = 1;
      }
    }

    // SAMP: send stack event file
    //
    addSendStackEvtFile(active, mainDiv, stack, versionTable);

    // border color depends on the processing status; this is an
    // attempt to subtly reinforce the color scheme
    //
    const bcol = stack.status ? 'gold' : 'grey';
    parent.style.borderColor = bcol;
    parent.style.display = 'block';
  }

  // Returns the pane, creating it if necessary (name is
  // the id of the element).
  //
  // It is assumed that the item has an id of <name> and
  // a class of <name>pane.
  //
  // It took me longer than I care to admit to realise calling
  // the third argument draggable was not a good idea, since
  // I need to access draggable.startDrag here...
  //
  function findPane(name, loc, dragflag) {
    const sel = `#${name}`;
    let pane = document.querySelector(sel);
    if (pane !== null) return pane;

    const host = wwt.getHost();
    if (host === null) { return null; }

    pane = document.createElement('div');
    host.appendChild(pane);

    pane.id = name;
    pane.setAttribute('class', `${name}pane`);

    const classes = pane.classList;
    if (loc !== null) {
      const style = pane.style;
      for (let attr in loc) {
	style[attr] = loc[attr];
	classes.add(`pane-pos-${attr}`);
      }
    }

    if (dragflag) {
      pane.draggable = true;
      pane.addEventListener('dragstart', draggable.startDrag, false);
    }

    return pane;
  }

  function findSourceInfo() {
    return findPane('sourceinfo', {right: '2em', top: '3em'}, true);
  }

  function findSourceSelection() {
    return findPane('sourceselection', {right: '2em', bottom: '3em'}, true);
  }

  function findStackInfo() {
    return findPane('stackinfo', {right: '2em', top: '3em'}, true);
  }

  function findNearestSourceInfo() {
    return findPane('nearestsourceinfo',
		    {left: '0.5em', bottom: '0.5em'}, true);
  }

  function findNearestStackInfo() {
    return findPane('neareststackinfo',
		    {left: '0.5em', bottom: '0.5em'}, true);
  }

  function findPolygonInfo() {
    return findPane('polygoninfo',
		    {right: '0.5em', bottom: '0.5em'}, true);
  }

  // Add the info for this stack to the main screen. versionTable is
  // expected to have fields that give the version number for the given
  // filetype (or null if it is missing)
  //
  function addStackInfo(stack, versionTable) {
    const parent = findStackInfo();
    if (parent === null) { return; }
    addStackInfoContents(parent, stack, versionTable, true);
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

    // Need version values for the SAMP button to appear, but doesn't
    // really matter what it is.
    const versionTable = {stkevt3: 20, sensity: 22};
    addStackInfoContents(parent, stack, versionTable, false);
  }

  // Hide the element, remove its children, and return it.
  // The selector is assumed to be valid, but if it is not
  // then null is returned and a message is logged.
  //
  function clearElement(selector) {
    const el = document.querySelector(selector);
    if (el === null) {
      console.log(`INTERNAL ERROR [clearElement]: unable to find ${selector}`);
      return null;
    }
    el.style.display = 'none';
    removeChildren(el);
    return el;
  }

  function clearStackInfo() {
    clearElement('#stackinfo');
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

  function addLinkRow(parent, url, lbl, val, active) {
    if (typeof active === 'undefined') { active = true; }

    const tr = document.createElement('tr');

    const ltd = document.createElement('td');
    ltd.setAttribute('class', 'label');

    const a = document.createElement('a');
    if (active) {
      a.setAttribute('target', '_blank');
      a.setAttribute('href', url);
    } else {
      a.setAttribute('href', '#');
    }
    a.innerText = lbl;

    ltd.appendChild(a);

    const vtd = document.createElement('td');
    vtd.setAttribute('class', 'value');
    vtd.innerText = textify(val);

    parent.appendChild(tr);
    tr.appendChild(ltd);
    tr.appendChild(vtd);
  }

  function addErrorRows(parent, url, lbl, val, loval, hival, active) {
    addLinkRow(parent, url, lbl, val, active);
    addRow(parent, 'Lower confidence limit', loval, 'labellimit');
    addRow(parent, 'Upper confidence limit', hival, 'labellimit');
  }

  // What is the label to use for the given band. This is needed to
  // support the "compression" in the data, where 0 indicates
  // broad and 1 is wide. -1 is mapped to "".
  // Also supports the old version
  //
  function getFluxBand(fluxband) {
    if (fluxband === 0) {
      return 'broad';
    } else if (fluxband === 1) {
      return 'wide';
    } else if (fluxband === -1) {
      return '';
    } else {
      // Assume "old format" data
      return fluxband;
    }
  }

  // Add the table of source properties (if they exist) to the
  // given element.
  //
  function addSourceProperties(parent, src, active) {
    if (typeof active === 'undefined') { active = true; }

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

    // Support new and old labelling (1 or TRUE)
    const confused = (src.conf_flag === 1) || (src.conf_flag === 'TRUE');
    const saturated = (src.sat_src_flag === 1) || (src.sat_src_flag === 'TRUE');

    if (confused || saturated) {
      let stext;
      if (confused) {
	stext = 'Source detection was affected by confusion';
	if (saturated) {
	  stext += ' and saturation';
	}
	stext += '.';
      } else {
	stext = 'Source detection was affected by saturation.';
      }
      addPara(parent, stext);
    }

    if ((src.var_flag === 1) || (src.var_flag === 'TRUE')) {
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
	       errlbl, active);

    // TODO: should we convert to the appropriate power of 10,
    //       or always leave as 10^20?
    //
    addRow(tbody,
	   'Galactic n<sub>H</sub> column density',
	   src.nh_gal + ' × 10²⁰ cm⁻²');

    // Support old and new system)
    const hasFluxes = ['broad', 'wide', 0, 1];
    if (hasFluxes.indexOf(src.fluxband) > -1) {
      addErrorRows(tbody,
		   'columns/fluxes.html#apphotflux',
		   `Aperture-corrected flux (${getFluxBand(src.fluxband)} band)`,
		   `${src.flux} erg cm⁻² s⁻¹`,
		   src.flux_lolim,
		   src.flux_hilim,
		   active);
    }

    addLinkRow(tbody, 'columns/significance.html',
	       'Source significance (S/N)',
	       src.significance, active);

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
		   src.hard_hm_hilim,
		   active);
    }

    if ((src.hard_ms !== null) ||
	(src.hard_ms_lolim !== null) ||
	(src.hard_ms_hilim !== null)) {
      addErrorRows(tbody,
		   'columns/spectral_properties.html',
		   'Medium/Soft band hardness ratio',
		   src.hard_ms,
		   src.hard_ms_lolim,
		   src.hard_ms_hilim,
		   active);
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
    if (active) {
      a.setAttribute('target', '_blank');
      a.setAttribute('href', 'caveats.html');
    } else {
      a.setAttribute('href', '#');
    }
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
  function addSourceInfoContents(parent, src, active) {

    const mainDiv = addControlElements(parent,
				       `Source: ${src.name}`,
				       wwt.clearNearestSource,
				       active);

    const binfoDiv = mkDiv('basicinfo');
    mainDiv.appendChild(binfoDiv);

    addSpanLink(binfoDiv, 'clipboard',
		'Copy name to clipboard',
		active ? (event) => wwt.copyToClipboard(event, src.name) : null);

    const span = document.createElement('span');
    span.setAttribute('class', 'search');
    addText(span, 'Search nearby: ');
    addNEDCoordLink(span, src.ra, src.dec, active);
    addText(span, ' or ');
    addSIMBADCoordLink(span, src.ra, src.dec, active);

    binfoDiv.appendChild(span);

    addSpanLink(binfoDiv, 'zoomto', 'Zoom to source',
		active ? () => wwt.zoomToSource(src.name) : null);

    mainDiv.appendChild(document.createElement('br'));

    const nDiv = mkDiv('not-semantic-name');
    mainDiv.appendChild(nDiv);

    // Location of source
    //
    nDiv.appendChild(addLocation(src.ra, src.dec, active));

    // finished adding to nDiv
    addSourceProperties(mainDiv, src, active);

    // SAMP: send source properties
    //
    addSendSourcePropertiesName(active, mainDiv, src);

    parent.style.display = 'block';
  }

  // srcid is the position of the source within catalogData
  //
  // FOR NOW, use nh_gal as an indicator of whether we have
  // source properties or not. Should be a better way.
  //
  function addSourceInfo(src) {
    const parent = findSourceInfo();
    if (parent === null) { return; }
    addSourceInfoContents(parent, src, true);
  }

  function addSourceInfoHelp(src) {
    const parent = document.querySelector('#sourceinfoexample');
    if (parent === null) {
      console.log('Internal error: missing #sourceinfoexample');
      return;
    }
    addSourceInfoContents(parent, src, false);
  }

  function clearSourceInfo() {
    clearElement('#sourceinfo');
  }

  // Add an option element to the select instance. At the moment only
  // plain text can be used as the contents.
  //
  function makeOption(value, label) {
    const option = document.createElement('option');
    option.setAttribute('value', value);
    addText(option, label);
    return option;
  }

  function addOption(sel, value, label) {
    sel.appendChild(makeOption(value, label));
  }

  // Create an option list of SAMP clients. The user uses this to
  // decide where the message is sent. The options are
  //
  // *) currently unused
  //
  //    -- select target --      if unselected argument is true
  //        would need to disable/enable button when set/changed
  //
  // *) always present
  //
  //    copy to clipboard
  //
  // *) hub present but not registered
  //
  //    all
  //    find clients
  //
  // *) registered with hub and at least one client accepts the mtype
  //
  //    all                      if multiple clients
  //    client name 1
  //    ...
  //    client name n
  //
  // This list is updated by refreshSAMPClientList.
  //
  // To differentiate between a general option (e.g. copy to clipboard)
  // and a client name, the values are opt-<value> or client-<name>,
  // other than the 'select target' option, which is empty.
  //
  function createSAMPClientList(active, id, mtype, unselected) {
    const sel = document.createElement('select');
    if (active) {
      sel.id = id;
      sel.setAttribute('name', id);
    } else {
      sel.id = `${id}-example`;
      sel.setAttribute('name', `${id}-example`);
    }
    sel.setAttribute('class', 'button');
    sel.setAttribute('data-clientlist-mtype', mtype);
    sel.setAttribute('data-clientlist-unselected', unselected);

    if (unselected) {
      addOption(sel, '', '-- select target --');
    }

    addOption(sel, wwtsamp.TARGET_CLIPBOARD, 'copy to clipboard');

    refreshSAMPClientList(sel);
    return sel;
  }

  // Re-create the optional contents of the SAMP client list selector.
  //
  // The list contents are only updated if there is a change. This is
  // separate from the selected option, which is changed to highlight
  // the SAMP option if possible:
  //   - if SAMP is unavailable or not running, then select
  //     'copy to clipboard'
  //   - if SAMP is available
  //     - if the previously-selected client is still available
  //       then use it (this EXCLUDES 'copy to clipboard', as otherwise
  //       we won't pick up a new value)
  //     - if there is only one registered client, pick that
  //     - otherwise select 'All clients'
  //
  function refreshSAMPClientList(sel) {
    const mtype = sel.getAttribute('data-clientlist-mtype');
    const unselected = sel.getAttribute('data-clientlist-unselected');
    if ((mtype === null) || (unselected === null)) {
      console.log(`Internal error: not SAMP clientlist ${sel}`);
      return;
    }

    const oldOptions = sel.querySelectorAll('option');
    const startClear = 1 + (unselected === 'true' ? 1 : 0);

    // Do we need to refresh the list?
    //
    // Note that clients is null if we are not registered with a hub.
    //
    const hasHub = wwtsamp.hasHub();
    const isRunning = wwtsamp.isRunning();

    // See the comments to createSAMPClientList for the logic (the
    // aim is to only provide an option when it is meaningfull).
    //
    // Also decide the "new" default selection here (although it
    // may not be used), and store the value rather than the label.
    //
    let defValue = wwtsamp.TARGET_CLIPBOARD;

    const newOptions = [];
    if (hasHub && isRunning) {
      const allOption = makeOption(wwtsamp.TARGET_ALL, 'All clients');
      defValue = wwtsamp.TARGET_ALL;
      if (wwtsamp.isRegistered()) {
	const clients = wwtsamp.respondsTo(mtype);
	// should not be null here, but just in case
	if ((clients !== null) && (clients.length > 0)) {
	  if (clients.length > 1) {
	    newOptions.push(allOption);
	  } else {
	    defValue = wwtsamp.targetClient(clients[0]);
	  }
	  clients.forEach(client => {
	    newOptions.push(makeOption(wwtsamp.targetClient(client),
				       client.name));
	  });
	}
      } else {
	newOptions.push(allOption);
	newOptions.push(makeOption(wwtsamp.TARGET_FIND, 'Find clients'));
      }
    }

    // If the new and old lists are the same then we do not need to
    // do anything.
    //
    let i;
    if (oldOptions.length === newOptions.length + startClear) {
      let flag = true;
      for (i = 0; flag && (i < newOptions.length); i++) {
	const oldO = oldOptions[i + startClear];
	const newO = newOptions[i];
	const same = ((oldO.value === newO.value) &&
		      (oldO.innerText === newO.innerText));
	flag = flag && same;
      }
      if (flag) {
	return;
      }
    }

    // What is the currently-selected option? We replace "copy to clipboard"
    // by defValue if found (although defValue may be "copy to clipboard").
    //
    let selOpt = sel.querySelector('option:checked');
    let selectedValue = null;
    if (selOpt !== null) {
      if (selOpt.value !== wwtsamp.TARGET_CLIPBOARD) {
	selectedValue = selOpt.value;
      }
    }
    if (selectedValue === null) {
      selectedValue = defValue;
    }

    for (i = oldOptions.length; i >= startClear; i--) {
	sel.remove(i);
    }

    newOptions.forEach(opt => sel.appendChild(opt));

    // If we can, use the previous selection. Requery the DOM just
    // to make it easier to follow.
    //
    let qstr = selectedValue === '' ? 'option[value=""]'
	: `option[value=${selectedValue}]`;
    selOpt = sel.querySelector(qstr);
    if (selOpt !== null) {
      selOpt.selected = true;
    } else {
      qstr = `option[value=${defValue}]`;
      selOpt = sel.querySelector(qstr);
      if (selOpt !== null) {
	selOpt.selected = true;
      } else {
	// Don't know what to do, so pick the first one
	sel.querySelector('option').selected = true;
      }
    }

    // Try to ensure any handlers for this widget get fired in case there
    // has been a change in the selected item.
    //
    try {
      sel.dispatchEvent(new CustomEvent('change'));
    }
    catch (e) {
      console.log(`INTERNAL ERROR: unable to trigger change for SAMP client list ${sel.id}`);
    }

  }

  // Add the export-to-samp options.
  //
  function createExportSourceProperties(active, ra0, dec0, rmax) {
    const clientListId = 'export-clientlist-sources';
    const mtype = 'table.load.votable';

    // What is being exported?
    //
    const adqlList = document.createElement('select');
    adqlList.id = 'export-samp-choice';
    adqlList.setAttribute('name', adqlList.id);
    adqlList.setAttribute('class', 'button');

    const opts = [{value: 'basic', label: 'Basic Summary'},
		  {value: 'summary', label: 'Summary'},
		  {value: 'photometry', label: 'Photometric'},
		  {value: 'variability', label: 'Variability'}];
    opts.forEach(opt => {
      // Add 'Master Source' prefix to match CSCView but will it
      // use up too-much space on the screen?
      addOption(adqlList, opt.value, `Master Source ${opt.label}`);
    });

    // What information is tracked?
    //
    const selected = {target: wwtsamp.TARGET_CLIPBOARD, choice: 'basic'};

    const els = createSAMPExport(active, mtype, 'export-samp',
				 clientListId, adqlList, selected);

    if (active) {
      adqlList.addEventListener('change', ev => {
	selected.choice = ev.target.value;
      }, false);

      els.button.addEventListener('click', (event) => {
	console.log(`Chosen ADQL option: ${selected.choice}`);
	console.log(`Chosen target: ${selected.target}`);
	wwtsamp.sendSourcePropertiesNear(event, ra0, dec0, rmax,
					 selected.choice,
					 selected.target);
      }, false);
    }

    return els.container;
  }

  // Create the "you've selectected elevnty-million sources,
  // now what" pane. I assume there will need to be a version for
  // the help page.
  //
  function addSourceSelectionInfo(parent, ra0, dec0, rmax, catinfo, active) {
    if ((catinfo === null) || (catinfo.annotations === null)) {
      console.log('INTERNAL ERROR: addSourceSelection sent catinfo[.annotations]=null');
      return;
    }
    const nsrc = catinfo.annotations.length;
    if (nsrc < 1) {
      console.log('INTERNAL ERROR: addSourceSelection sent empty srcs');
      return;
    }

    const mainDiv = addControlElements(parent,
				       'CSC 2.0 sources',
				       wwt.hideSources,
				       active);

    const p = document.createElement('p');
    mainDiv.appendChild(p);

    let rlabel = '';
    if (rmax >= 1.0) {
      rlabel = `${rmax.toFixed(1)}°`;
    } else if (rmax >= (1.0 / 60.0)) {
      rlabel = `${(rmax * 60).toFixed(1)}'`; // for emacs: '
    } else {
      rlabel = `${(rmax * 3600).toFixed(1)}"`; // for emacs: "
    }

    // TODO: add a "add to clipboard" icon?
    //
    const pos = wwt.convertCoordinate(ra0, dec0, 'letters', true);

    // TODO: number needs to be editable (for when the selection
    //       happens)
    //
    const lbl = nsrc === 1 ?
	  'You have selected one source' :
	  `You have selected ${nsrc} sources`;
    addText(p, lbl);
    addText(p, ` within ${rlabel} of `);
    p.insertAdjacentHTML('beforeend', pos);
    addText(p, '.');

    // Add plot button.
    //
    const pbtn = document.createElement('button');
    pbtn.id = 'display-source-plot';
    pbtn.setAttribute('class', 'button');
    pbtn.setAttribute('type', 'button');
    addText(pbtn, 'Plot source properties');
    if (active) {
      pbtn.addEventListener('click',
			    () => wwtplots.plotSources(catinfo),
			    false);
    }

    //   - add plot button
    //   - add menu for SAMP table calls
    //
    // Do not bother with data ranges since this is in the plots.
    // Could have some widgets that let us filter on various columns.
    //
    const pplot = document.createElement('p');
    pplot.appendChild(pbtn);
    mainDiv.appendChild(pplot);

    // Add menu for SAMP table calls
    //
    const psamp = createExportSourceProperties(active, ra0, dec0, rmax);
    mainDiv.appendChild(psamp);

    parent.style.display = 'block';
  }

  function addSourceSelection(ra, dec, rmax, catinfo) {
    const parent = findSourceSelection();
    if (parent === null) { return; }
    addSourceSelectionInfo(parent, ra, dec, rmax, catinfo, true);
  }

  function addSourceSelectionHelp(ra, dec, rmax, catinfo) {
    const parent = document.querySelector('#sourceselectionexample');
    if (parent === null) {
      console.log('Internal error: missing #sourceselectionexample');
      return;
    }
    addSourceSelectionInfo(parent, ra, dec, rmax, catinfo, false);
  }

  function clearSourceSelection() {
    clearElement('#sourceselection');
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

    const pane = findNearestStackInfo();
    if (pane === null) { return; }

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
    const mainDiv = addControlElements(pane,
				       'Nearest stack' + (n > 1 ? 's' : ''),
				       close,
				       true);

    const tbl = document.createElement('table');
    mainDiv.appendChild(tbl);

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
      }, false);

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
      }, false);

      trow.addEventListener('mouseleave', () => {
	fovs.forEach(fov => fov.set_fill(false));
	trow.classList.remove('selected');
      }, false);

      trow.appendChild(mkStack(stack.stackid, fovs));
      trow.appendChild(mkElem('td', mkSep(sep)));
    });

    pane.style.display = 'block';
  }

  function addNearestSourceTable(indexes, neighbors) {
    const n = neighbors.length;
    if (n === 0) { return; }

    const pane = findNearestSourceInfo();
    if (pane === null) { return; }

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
    const mainDiv = addControlElements(pane,
				       'Nearest source' + (n > 1 ? 's' : ''),
				       close,
				       true);

    const tbl = document.createElement('table');
    mainDiv.appendChild(tbl);

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

    trow.appendChild(mkElem('th', 'NACIS, NHRC'));

    trow.appendChild(mkElem('th', 'Variable'));
    trow.appendChild(mkElem('th', 'flux band'));
    trow.appendChild(mkElem('th', 'flux'));
    trow.appendChild(mkElem('th', 'nH'));  // use subscript?

    const tbody = document.createElement('tbody');
    tbl.appendChild(tbody);

    const nameIdx = indexes.name;
    const sigIdx = indexes.significance;
    const nacisIdx = indexes.nacis;
    const nhrcIdx = indexes.nhrc;
    const varIdx = indexes.variability;
    const bandIdx = indexes.fluxband;
    const fluxIdx = indexes.flux;
    const nhIdx = indexes.nh;

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
      }, false);

      const td = document.createElement('td');
      td.appendChild(lnk);
      return td;
    }

    const mkButton = (flag) => {
      const btn = document.createElement('input');
      btn.setAttribute('type', 'checkbox');
      btn.checked = (flag === 1) || (flag === 'TRUE');
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
      }, false);

      trow.addEventListener('mouseleave', () => {
	ann.set_lineColor(origColor);
	trow.classList.remove('selected');
      }, false);

      trow.appendChild(mkSrcLink(src, ra, dec, ann, origColor));
      trow.appendChild(mkElem('td', mkSep(sep)));
      trow.appendChild(mkElem('td', src[sigIdx]));

      trow.appendChild(mkElem('td',
			      `${src[nacisIdx]},${src[nhrcIdx]}`));

      trow.appendChild(mkButton(src[varIdx]));

      trow.appendChild(mkElem('td', getFluxBand(src[bandIdx])));
      trow.appendChild(mkElem('td', src[fluxIdx]));
      trow.appendChild(mkElem('td', src[nhIdx]));
    });

    pane.style.display = 'block';

  }

  function clearNearestStackTable() {
    clearElement('#neareststackinfo');
  }

  function clearNearestSourceTable() {
    clearElement('#nearestsourceinfo');
  }

  // What can we do for polygon source selection?
  //
  function addPolygonPane() {
    let parent = findPolygonInfo();
    removeChildren(parent);

    const mainDiv = addControlElements(parent,
				       'Source selection',
				       closePolygonPane,
				       true);

    const pwarn = document.createElement('p');
    addText(pwarn, '*** NOT FULLY FUNCTIONAL YET ***');
    mainDiv.appendChild(pwarn);

    const p = document.createElement('p');
    addText(p, 'Add edges of a polygon by left-clicking.');
    mainDiv.appendChild(p);

    const pinfo = document.createElement('p');
    pinfo.id = 'number-of-polygon-points';
    addText(pinfo, 'No points selected!');
    mainDiv.appendChild(pinfo);

    const buttonDiv = mkDiv('button-container');
    mainDiv.appendChild(buttonDiv);

    const btn1 = document.createElement('button');
    btn1.id = 'finished-polygon';
    btn1.setAttribute('class', 'button');
    btn1.setAttribute('type', 'button');
    addText(btn1, 'End selection');
    btn1.disabled = true;
    btn1.addEventListener('click',
			  () => alert('Not sure what to do yet'),
			  false);
    buttonDiv.appendChild(btn1);

    const btn2 = document.createElement('button');
    btn2.setAttribute('class', 'button');
    btn2.setAttribute('type', 'button');
    addText(btn2, 'Cancel');
    btn2.addEventListener('click', closePolygonPane, false);
    buttonDiv.appendChild(btn2);

    parent.style.display = 'block';
  }

  // Note: this switches back to source selection; not 100% convinced
  //       about this
  function closePolygonPane() {
    wwt.clearRegionSelection();

    const el = document.querySelector('#polygoninfo');
    if (el !== null) {
      el.style.display = 'none';
    }

    const sel = document.querySelector('#selectionmode');
    for (var idx = 0; idx < sel.options.length; idx++) {
      const opt = sel.options[idx];
      if (opt.value === 'source') {
	opt.selected = true;
      }
    }

    try {
      sel.dispatchEvent(new CustomEvent('change'));
    }
    catch (e) {
      console.log(`INTERNAL ERROR: unable to change selection mode: ${e}`);
    }

  }

  return { addStackInfo: addStackInfo,
	   addStackInfoHelp: addStackInfoHelp,
	   clearStackInfo: clearStackInfo,

	   addSourceInfo: addSourceInfo,
	   addSourceInfoHelp: addSourceInfoHelp,
	   clearSourceInfo: clearSourceInfo,

	   addSourceSelection: addSourceSelection,
	   addSourceSelectionHelp: addSourceSelectionHelp,
	   clearSourceSelection: clearSourceSelection,

	   addNearestStackTable: addNearestStackTable,
	   addNearestSourceTable: addNearestSourceTable,
	   clearNearestStackTable: clearNearestStackTable,
	   clearNearestSourceTable: clearNearestSourceTable,

	   addPolygonPane: addPolygonPane,
	   closePolygonPane: closePolygonPane,

	   refreshSAMPClientList: refreshSAMPClientList,

	   raToTokens: raToTokens,
	   decToTokens: decToTokens,
	   raToHTML: raToHTML,
	   decToHTML: decToHTML

         };

})();
