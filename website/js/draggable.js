'use strict';

/*
 * Basic support for draggable "windows" (aka panes)
 *
 * Some assumptions/requirements:
 *   - the draggable element has an id
 *   - the draggable has one of each of these pair of classes set.
 *         pane-pos-left pane-pos-right
 *         pane-pos-top pane-pos-bottom
 */

const draggable = (function () {

  const paneMimeType = 'application/x-pane+json';

  // Perhaps I should just always use clientX/Y rather than this?
  //
  function getEventPos(event) {
    var x, y;
    if (typeof event.x === 'undefined') {
      x = event.clientX;
      y = event.clientY;
    } else {
      x = event.x;
      y = event.y;
    }
    return {x: x, y: y};
  }

  // Initialize the drag, storing the start location.
  //
  // Note that if the user starts the drag on an icon then they
  // can try to drag that. We could identify the parent element
  // but instead cancel the drag.
  //
  function startDrag(event) {

    // If this comes from any range sliders then cancel the panel
    // drag. See https://stackoverflow.com/a/20819717
    //
    // This shouldn't be needed just yet but left as a comment in
    // case I add a range slider.
    //
    /***
	if (document.activeElement.tagName === 'INPUT') {
	return false;
	}
    ***/

    const toMove = event.target.id;
    if ((typeof toMove === 'undefined') || (toMove === null) ||
	(toMove === '')) {
      console.log('WARNING: startDrag unable to identify ' +
		  `target=${toMove}`);
      event.preventDefault();
      return false;
    }

    // Store the current location of the event, so we can find out
    // how much we have shifted by.
    //
    const evpos = getEventPos(event);
    evpos.id = toMove;
    event.dataTransfer.setData(paneMimeType, JSON.stringify(evpos));

    // The id is not supposed to contain a space, and we don't, so
    // it's okay to separate with spaces.
    //
    const store = `${evpos.x} ${evpos.y} ${toMove}`;
    event.dataTransfer.setData('text/plain', store);

    // All we want to do is change the position of the div,
    // but do not change the DOM at all. So it's not clear
    // what the best value here is.
    //
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.dropEffect = 'move';
  }

  // Note that the way the movement happens, the position is
  // remembered when the pane is deleted and then re-shown.
  // This seems to be okay from a usability viewpoint, but
  // may need to be thought about at a later date.
  //
  function stopDrag(event) {

    // It's not clear whether I can guarantee that the structured
    // data is available, so code up a fallback, just in case.
    //
    var x0, y0, toMove;
    var fallback = true;
    const types = event.dataTransfer.types;
    for (var i = 0; i < types.length; i++) {
      if (types[i] === paneMimeType) {
        fallback = false;
        break;
      }
    }
    if (fallback) {
      const store = event.dataTransfer.getData('text/plain');
      const tags = store.split(' ');
      if (tags.length !== 3) {
        console.log(`Invalid store data from drop: [${store}]`);
        event.preventDefault();  // is this sensible here?
        return;
      }
      x0 = parseInt(tags[0]);
      y0 = parseInt(tags[1]);
      toMove = tags[2];
    } else {
      const json = event.dataTransfer.getData(paneMimeType);
      const obj = JSON.parse(json);
      x0 = obj.x;
      y0 = obj.y;
      toMove = obj.id;
    }

    // I have seen toMove be empty, so trap this case (assume it is
    // something it is safe to just drop out of).
    //
    if ((typeof toMove === 'undefined') || (toMove === null) ||
	(toMove === '')) {
      console.log(`NOTE: in stopDrag found toMove=${toMove}`);
      return;
    }

    const evpos = getEventPos(event);
    const dx = evpos.x - x0;
    const dy = evpos.y - y0;

    // This is not expected to fail, so do not try to do much
    // if it does.
    //
    const pane = document.querySelector('#' + toMove);
    if (pane === null) {
      console.log('INTERNAL ERROR: unable to find item being dragged!');
      return;
    }

    const panebbox = pane.getBoundingClientRect();
    const parentbbox = pane.parentElement.getBoundingClientRect();

    var x1 = pane.offsetLeft + dx;
    var y1 = pane.offsetTop + dy;

    const xmin = 0;
    const ymin = 0;
    const xmax = parentbbox.width - panebbox.width;
    const ymax = parentbbox.height - panebbox.height;
    if (x1 < xmin) { x1 = xmin; } else if (x1 > xmax) { x1 = xmax; }
    if (y1 < ymin) { y1 = ymin; } else if (y1 > ymax) { y1 = ymax; }

    // Is knowing the current values useful?
    // const pstyles = window.getComputedStyle(pane);

    // This is more complicated than I want, since the intention
    // is to only change the two coordinates used to position
    // the pane (left or right, top or bottom), but how do we know
    // here how it was positioned? If the starting location is
    // defined in the style sheet then the style.xxxx values
    // will be empty. At present the pane is set with classes
    //     pane-pos-<left|right|top|bottom>
    // to define which coordinates to set here.
    //
    // The intention of the above is to allow the width/height
    // of the pane vary depending on the content (i.e. not to
    // set all the top/bottom/left/right values).
    //
    let lr = 0;
    let tb = 0;

    const classes = pane.classList;
    if (classes.contains('pane-pos-left')) {
      pane.style.left = `${x1}px`;
      lr += 1;
    }
    if (classes.contains('pane-pos-right')) {
      pane.style.right = `${xmax - x1}px`;
      lr += 1;
    }
    if (classes.contains('pane-pos-top')) {
      pane.style.top = `${y1}px`;
      tb += 1;
    }
    if (classes.contains('pane-pos-bottom')) {
      pane.style.bottom = `${ymax - y1}px`;
      tb += 1;
    }

    // Log any "unusual" panes but do not try to do anything more.
    //
    if ((lr !== 1) || (tb !== 1)) {
      console.log(`WARNING-drag: id=${toMove} has left-right=${lr} top-bottom=${tb}`);
    }

    event.preventDefault();
  }

  return {startDrag: startDrag,
	  stopDrag: stopDrag};

})();
