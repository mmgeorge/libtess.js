/**
 * Copyright 2000, Silicon Graphics, Inc. All Rights Reserved.
 * Copyright 2012, Google Inc. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice including the dates of first publication and
 * either this permission notice or a reference to http://oss.sgi.com/projects/FreeB/
 * shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * SILICON GRAPHICS, INC. BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
 * IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Original Code. The Original Code is: OpenGL Sample Implementation,
 * Version 1.2.1, released January 26, 2000, developed by Silicon Graphics,
 * Inc. The Original Code is Copyright (c) 1991-2000 Silicon Graphics, Inc.
 * Copyright in any portions created by third parties is as indicated
 * elsewhere herein. All Rights Reserved.
 */
/* global libtess */

import { assert, DEBUG } from "../libtess";
import { GluFace } from "./GluFace";
import { GluHalfEdge } from "./GluHalfEdge";
import { GluVertex } from "./GluVertex";

/**
 * Creates a new mesh with no edges, no vertices,
 * and no loops (what we usually call a "face").
 *
 * @constructor
 * @struct
 */
export class GluMesh {
  constructor() {
    this.eHead = new GluHalfEdge();
    this.eHeadSym = new GluHalfEdge();

    // TODO(bckenny): better way to pair these?
    this.eHead.sym = this.eHeadSym;
    this.eHeadSym.sym = this.eHead;    
  }

  /**
   * dummy header for vertex list
   */
  vHead = new GluVertex();

  /**
   * dummy header for face list
   */
  fHead = new GluFace();

  /**
   * dummy header for edge list
   */
  eHead: GluHalfEdge; 

  /**
   * and its symmetric counterpart
   */
  eHeadSym: GluHalfEdge;

  

  // TODO(bckenny): #ifndef NDEBUG
  /**
   * Checks mesh for self-consistency.
   */
  checkMesh() {
    if (!DEBUG) {
      return;
    }

    var fHead = this.fHead;
    var vHead = this.vHead;
    var eHead = this.eHead;

    var e;

    // faces
    var f;
    var fPrev = fHead;
    for (fPrev = fHead; (f = fPrev.next) !== fHead; fPrev = f) {
      assert(f.prev === fPrev);
      e = f.anEdge;
      do {
        assert(e.sym !== e);
        assert(e.sym.sym === e);
        assert(e.lNext.oNext.sym === e);
        assert(e.oNext.sym.lNext === e);
        assert(e.lFace === f);
        e = e.lNext;
      } while (e !== f.anEdge);
    }
    assert(f.prev === fPrev && f.anEdge === null);

    // vertices
    var v;
    var vPrev = vHead;
    for (vPrev = vHead; (v = vPrev.next) !== vHead; vPrev = v) {
      assert(v.prev === vPrev);
      e = v.anEdge;
      do {
        assert(e.sym !== e);
        assert(e.sym.sym === e);
        assert(e.lNext.oNext.sym === e);
        assert(e.oNext.sym.lNext === e);
        assert(e.org === v);
        e = e.oNext;
      } while (e !== v.anEdge);
    }
    assert(v.prev === vPrev && v.anEdge === null && v.data === null);

    // edges
    var ePrev = eHead;
    for (ePrev = eHead; (e = ePrev.next) !== eHead; ePrev = e) {
      assert(e.sym.next === ePrev.sym);
      assert(e.sym !== e);
      assert(e.sym.sym === e);
      assert(e.org !== null);
      assert(e.dst() !== null);
      assert(e.lNext.oNext.sym === e);
      assert(e.oNext.sym.lNext === e);
    }
    assert(e.sym.next === ePrev.sym &&
      e.sym === this.eHeadSym &&
      e.sym.sym === e &&
      e.org === null && e.dst() === null &&
      e.lFace === null && e.rFace() === null);
  };

}
