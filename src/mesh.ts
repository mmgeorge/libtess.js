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

import { GluFace } from "./mesh/GluFace";
import { GluHalfEdge } from "./mesh/GluHalfEdge";
import { GluMesh } from "./mesh/GluMesh";
import { GluVertex } from "./mesh/GluVertex";

// TODO(bckenny): could maybe merge GluMesh and mesh.js since these are
// operations on the mesh


/****************** Basic Edge Operations **********************/

/**
 * makeEdge creates one edge, two vertices, and a loop (face).
 * The loop consists of the two new half-edges.
 */
export function makeEdge(mesh: GluMesh): GluHalfEdge {
  // TODO(bckenny): probably move to GluMesh, but needs Make* methods with it

  var e = makeEdgePair_(mesh.eHead);

  // complete edge with vertices and face (see mesh.makeEdgePair_)
  makeVertex_(e, mesh.vHead);
  makeVertex_(e.sym, mesh.vHead);
  makeFace_(e, mesh.fHead);

  return e;
};


/**
 * meshSplice(eOrg, eDst) is the basic operation for changing the
 * mesh connectivity and topology. It changes the mesh so that
 *  eOrg.oNext <- OLD( eDst.oNext )
 *  eDst.oNext <- OLD( eOrg.oNext )
 * where OLD(...) means the value before the meshSplice operation.
 *
 * This can have two effects on the vertex structure:
 *  - if eOrg.org != eDst.org, the two vertices are merged together
 *  - if eOrg.org == eDst.org, the origin is split into two vertices
 * In both cases, eDst.org is changed and eOrg.org is untouched.
 *
 * Similarly (and independently) for the face structure,
 *  - if eOrg.lFace == eDst.lFace, one loop is split into two
 *  - if eOrg.lFace != eDst.lFace, two distinct loops are joined into one
 * In both cases, eDst.lFace is changed and eOrg.lFace is unaffected.
 *
 * Some special cases:
 * If eDst == eOrg, the operation has no effect.
 * If eDst == eOrg.lNext, the new face will have a single edge.
 * If eDst == eOrg.lPrev(), the old face will have a single edge.
 * If eDst == eOrg.oNext, the new vertex will have a single edge.
 * If eDst == eOrg.oPrev(), the old vertex will have a single edge.
 */
export function meshSplice(eOrg: GluHalfEdge, eDst: GluHalfEdge): void {
  // TODO: more descriptive name?

  var joiningLoops = false;
  var joiningVertices = false;

  if (eOrg === eDst) {
    return;
  }

  if (eDst.org !== eOrg.org) {
    // We are merging two disjoint vertices -- destroy eDst.org
    joiningVertices = true;
    killVertex_(eDst.org, eOrg.org);
  }

  if (eDst.lFace !== eOrg.lFace) {
    // We are connecting two disjoint loops -- destroy eDst.lFace
    joiningLoops = true;
    killFace_(eDst.lFace, eOrg.lFace);
  }

  // Change the edge structure
  splice_(eDst, eOrg);

  if (!joiningVertices) {
    // We split one vertex into two -- the new vertex is eDst.org.
    // Make sure the old vertex points to a valid half-edge.
    makeVertex_(eDst, eOrg.org);
    eOrg.org.anEdge = eOrg;
  }

  if (!joiningLoops) {
    // We split one loop into two -- the new loop is eDst.lFace.
    // Make sure the old face points to a valid half-edge.
    makeFace_(eDst, eOrg.lFace);
    eOrg.lFace.anEdge = eOrg;
  }
};


/**
 * deleteEdge(eDel) removes the edge eDel. There are several cases:
 * if (eDel.lFace != eDel.rFace()), we join two loops into one; the loop
 * eDel.lFace is deleted. Otherwise, we are splitting one loop into two;
 * the newly created loop will contain eDel.dst(). If the deletion of eDel
 * would create isolated vertices, those are deleted as well.
 *
 * This function could be implemented as two calls to __gl_meshSplice
 * plus a few calls to memFree, but this would allocate and delete
 * unnecessary vertices and faces.
 */
export function deleteEdge(eDel: GluHalfEdge): void {
  var eDelSym = eDel.sym;
  var joiningLoops = false;

  // First step: disconnect the origin vertex eDel.org.  We make all
  // changes to get a consistent mesh in this "intermediate" state.
  if (eDel.lFace !== eDel.rFace()) {
    // We are joining two loops into one -- remove the left face
    joiningLoops = true;
    killFace_(eDel.lFace, eDel.rFace());
  }

  if (eDel.oNext === eDel) {
    killVertex_(eDel.org, null);

  } else {
    // Make sure that eDel.org and eDel.rFace() point to valid half-edges
    eDel.rFace().anEdge = eDel.oPrev();
    eDel.org.anEdge = eDel.oNext;

    splice_(eDel, eDel.oPrev());

    if (!joiningLoops) {
      // We are splitting one loop into two -- create a new loop for eDel.
      makeFace_(eDel, eDel.lFace);
    }
  }

  // Claim: the mesh is now in a consistent state, except that eDel.org
  // may have been deleted.  Now we disconnect eDel.dst().
  if (eDelSym.oNext === eDelSym) {
    killVertex_(eDelSym.org, null);
    killFace_(eDelSym.lFace, null);

  } else {
    // Make sure that eDel.dst() and eDel.lFace point to valid half-edges
    eDel.lFace.anEdge = eDelSym.oPrev();
    eDelSym.org.anEdge = eDelSym.oNext;
    splice_(eDelSym, eDelSym.oPrev());
  }

  // Any isolated vertices or faces have already been freed.
  killEdge_(eDel);
};

/******************** Other Edge Operations **********************/

/* All these routines can be implemented with the basic edge
 * operations above.  They are provided for convenience and efficiency.
 */


/**
 * addEdgeVertex(eOrg) creates a new edge eNew such that
 * eNew == eOrg.lNext, and eNew.dst() is a newly created vertex.
 * eOrg and eNew will have the same left face.
 */
export function addEdgeVertex(eOrg: GluHalfEdge): GluHalfEdge {
  // TODO(bckenny): why is it named this?

  var eNew = makeEdgePair_(eOrg);
  var eNewSym = eNew.sym;

  // Connect the new edge appropriately
  splice_(eNew, eOrg.lNext);

  // Set the vertex and face information
  eNew.org = eOrg.dst();

  makeVertex_(eNewSym, eNew.org);

  eNew.lFace = eNewSym.lFace = eOrg.lFace;

  return eNew;
};


/**
 * splitEdge(eOrg) splits eOrg into two edges eOrg and eNew,
 * such that eNew == eOrg.lNext. The new vertex is eOrg.dst() == eNew.org.
 * eOrg and eNew will have the same left face.
 */
export function splitEdge(eOrg: GluHalfEdge): GluHalfEdge {
  var tempHalfEdge = addEdgeVertex(eOrg);
  var eNew = tempHalfEdge.sym;

  // Disconnect eOrg from eOrg.dst() and connect it to eNew.org
  splice_(eOrg.sym, eOrg.sym.oPrev());
  splice_(eOrg.sym, eNew);

  // Set the vertex and face information
  eOrg.sym.org = eNew.org; // NOTE(bckenny): assignment to dst
  eNew.dst().anEdge = eNew.sym;  // may have pointed to eOrg.sym
  eNew.sym.lFace = eOrg.rFace(); // NOTE(bckenny): assignment to rFace
  eNew.winding = eOrg.winding;  // copy old winding information
  eNew.sym.winding = eOrg.sym.winding;

  return eNew;
};


/**
 * connect(eOrg, eDst) creates a new edge from eOrg.dst()
 * to eDst.org, and returns the corresponding half-edge eNew.
 * If eOrg.lFace == eDst.lFace, this splits one loop into two,
 * and the newly created loop is eNew.lFace. Otherwise, two disjoint
 * loops are merged into one, and the loop eDst.lFace is destroyed.
 *
 * If (eOrg == eDst), the new face will have only two edges.
 * If (eOrg.lNext == eDst), the old face is reduced to a single edge.
 * If (eOrg.lNext.lNext == eDst), the old face is reduced to two edges.
 */
export function connect(eOrg: GluHalfEdge, eDst: GluHalfEdge): GluHalfEdge {
  var joiningLoops = false;
  var eNew = makeEdgePair_(eOrg);
  var eNewSym = eNew.sym;

  if (eDst.lFace !== eOrg.lFace) {
    // We are connecting two disjoint loops -- destroy eDst.lFace
    joiningLoops = true;
    killFace_(eDst.lFace, eOrg.lFace);
  }

  // Connect the new edge appropriately
  splice_(eNew, eOrg.lNext);
  splice_(eNewSym, eDst);

  // Set the vertex and face information
  eNew.org = eOrg.dst();
  eNewSym.org = eDst.org;
  eNew.lFace = eNewSym.lFace = eOrg.lFace;

  // Make sure the old face points to a valid half-edge
  eOrg.lFace.anEdge = eNewSym;

  if (!joiningLoops) {
    // We split one loop into two -- the new loop is eNew.lFace
    makeFace_(eNew, eOrg.lFace);
  }
  return eNew;
};

/******************** Other Operations **********************/


/**
 * zapFace(fZap) destroys a face and removes it from the
 * global face list. All edges of fZap will have a null pointer as their
 * left face. Any edges which also have a null pointer as their right face
 * are deleted entirely (along with any isolated vertices this produces).
 * An entire mesh can be deleted by zapping its faces, one at a time,
 * in any order. Zapped faces cannot be used in further mesh operations!
 */
export function zapFace(fZap: GluFace): void {
  var eStart = fZap.anEdge;

  // walk around face, deleting edges whose right face is also NULL
  var eNext = eStart.lNext;
  var e;
  do {
    e = eNext;
    eNext = e.lNext;

    e.lFace = null;
    if (e.rFace() === null) {
      // delete the edge -- see mesh.deleteEdge above
      if (e.oNext === e) {
        killVertex_(e.org, null);

      } else {
        // Make sure that e.org points to a valid half-edge
        e.org.anEdge = e.oNext;
        splice_(e, e.oPrev());
      }

      var eSym = e.sym;

      if (eSym.oNext === eSym) {
        killVertex_(eSym.org, null);

      } else {
        // Make sure that eSym.org points to a valid half-edge
        eSym.org.anEdge = eSym.oNext;
        splice_(eSym, eSym.oPrev());
      }
      killEdge_(e);
    }
  } while (e !== eStart);

  // delete from circular doubly-linked list
  var fPrev = fZap.prev;
  var fNext = fZap.next;
  fNext.prev = fPrev;
  fPrev.next = fNext;

  GluFace.pool.release(fZap); 
};

// TODO(bckenny): meshUnion isn't called within libtess and isn't part of the
// public API. Could be useful if more mesh manipulation functions are exposed.
/* istanbul ignore next */
/**
 * meshUnion() forms the union of all structures in
 * both meshes, and returns the new mesh (the old meshes are destroyed).
 */
export function meshUnion(mesh1: GluMesh, mesh2: GluMesh): GluMesh {
  // TODO(bceknny): probably move to GluMesh method
  var f1 = mesh1.fHead;
  var v1 = mesh1.vHead;
  var e1 = mesh1.eHead;

  var f2 = mesh2.fHead;
  var v2 = mesh2.vHead;
  var e2 = mesh2.eHead;

  // Add the faces, vertices, and edges of mesh2 to those of mesh1
  if (f2.next !== f2) {
    f1.prev.next = f2.next;
    f2.next.prev = f1.prev;
    f2.prev.next = f1;
    f1.prev = f2.prev;
  }

  if (v2.next !== v2) {
    v1.prev.next = v2.next;
    v2.next.prev = v1.prev;
    v2.prev.next = v1;
    v1.prev = v2.prev;
  }

  if (e2.next !== e2) {
    e1.sym.next.sym.next = e2.next;
    e2.next.sym.next = e1.sym.next;
    e2.sym.next.sym.next = e1;
    e1.sym.next = e2.sym.next;
  }

  //memFree GlueMesh
  
  //GluMesh.pool.release(mesh2);

  return mesh1;
};



/* __gl_meshDelete( eDel ) removes the edge eDel.  There are several cases:
 * if (eDel->Lface != eDel->Rface), we join two loops into one; the loop
 * eDel->Lface is deleted.  Otherwise, we are splitting one loop into two;
 * the newly created loop will contain eDel->Dst.  If the deletion of eDel
 * would create isolated vertices, those are deleted as well.
 *
 * This function could be implemented as two calls to __gl_meshSplice
 * plus a few calls to memFree, but this would allocate and delete
 * unnecessary vertices and faces.
 */
export function deleteMesh2(mesh: GluMesh) {
  const head = mesh.fHead;

  while (head.next !== head) {
    zapFace(head.next); 
  }

  GluHalfEdge.pool.release(mesh.eHead);
  GluHalfEdge.pool.release(mesh.eHeadSym); 

  // memFree mesh
};


export function deleteMesh(mesh: GluMesh) {
  let f, fNext: GluFace;
  let v, vNext: GluVertex;
  let e, eNext: GluHalfEdge; 
  
  for (f = mesh.fHead.next; f !== mesh.fHead; f = fNext) {
    fNext = f.next
    GluFace.pool.release(f); 
  }

  for (v = mesh.vHead.next; v !== mesh.vHead; v = vNext) {
    vNext = v.next;
    GluVertex.pool.release(v); 
  }

  for (e = mesh.eHead.next; e !== mesh.eHead; e = eNext) {
    eNext = e.next;
    GluHalfEdge.pool.release(e);
    GluHalfEdge.pool.release(e.sym); 
  }
  // memFree mesh

  GluHalfEdge.pool.release(mesh.eHead);
  GluHalfEdge.pool.release(mesh.eHeadSym); 
  GluVertex.pool.release(mesh.vHead);
  GluFace.pool.release(mesh.fHead); 
};

/************************ Utility Routines ************************/


/**
 * Creates a new pair of half-edges which form their own loop.
 * No vertex or face structures are allocated, but these must be assigned
 * before the current edge operation is completed.
 *
 * TODO(bckenny): warning about eNext strictly being first of pair? (see code)
 */
export function makeEdgePair_(eNext: GluHalfEdge): GluHalfEdge {
  var e = GluHalfEdge.pool.acquire();
  var eSym = GluHalfEdge.pool.acquire();

  // TODO(bckenny): how do we ensure this? see above comment in jsdoc
  // Make sure eNext points to the first edge of the edge pair
  // if (eNext->Sym < eNext ) { eNext = eNext->Sym; }

  // NOTE(bckenny): check this for bugs in current implementation!

  // Insert in circular doubly-linked list before eNext.
  // Note that the prev pointer is stored in sym.next.
  var ePrev = eNext.sym.next;
  eSym.next = ePrev;
  ePrev.sym.next = e;
  e.next = eNext;
  eNext.sym.next = eSym;

  e.sym = eSym;
  e.oNext = e;
  e.lNext = eSym;

  eSym.sym = e;
  eSym.oNext = eSym;
  eSym.lNext = e;

  return e;
};


/**
 * splice_ is best described by the Guibas/Stolfi paper or the
 * CS348a notes. Basically, it modifies the mesh so that
 * a.oNext and b.oNext are exchanged. This can have various effects
 * depending on whether a and b belong to different face or vertex rings.
 * For more explanation see mesh.meshSplice below.
 */
function splice_(a: GluHalfEdge, b: GluHalfEdge): void {
  var aONext = a.oNext;
  var bONext = b.oNext;

  aONext.sym.lNext = b;
  bONext.sym.lNext = a;
  a.oNext = bONext;
  b.oNext = aONext;
};


/**
 * makeVertex_(eOrig, vNext) attaches a new vertex and makes it the
 * origin of all edges in the vertex loop to which eOrig belongs. "vNext" gives
 * a place to insert the new vertex in the global vertex list.  We insert
 * the new vertex *before* vNext so that algorithms which walk the vertex
 * list will not see the newly created vertices.
 *
 * NOTE: unlike original, acutally allocates new vertex.
 */
function makeVertex_(eOrig: GluHalfEdge, vNext: GluVertex) {
  // insert in circular doubly-linked list before vNext
  const vPrev = vNext.prev;
  const vNew = GluVertex.pool.acquire(vNext, vPrev);
  vPrev.next = vNew;
  vNext.prev = vNew;

  vNew.anEdge = eOrig;
  // leave coords, s, t undefined
  // TODO(bckenny): does above line mean 0 specifically, or does it matter?

  // fix other edges on this vertex loop
  let e = eOrig;
  do {
    e.org = vNew;
    e = e.oNext;
  } while (e !== eOrig);
};


/**
 * makeFace_(eOrig, fNext) attaches a new face and makes it the left
 * face of all edges in the face loop to which eOrig belongs. "fNext" gives
 * a place to insert the new face in the global face list.  We insert
 * the new face *before* fNext so that algorithms which walk the face
 * list will not see the newly created faces.
 *
 * NOTE: unlike original, acutally allocates new face.
 */
function makeFace_(eOrig: GluHalfEdge, fNext: GluFace) {
  // insert in circular doubly-linked list before fNext
  var fPrev = fNext.prev;
  var fNew = GluFace.pool.acquire(fNext, fPrev);
  fPrev.next = fNew;
  fNext.prev = fNew;

  fNew.anEdge = eOrig;

  // The new face is marked "inside" if the old one was.  This is a
  // convenience for the common case where a face has been split in two.
  fNew.inside = fNext.inside;

  // fix other edges on this face loop
  var e = eOrig;
  do {
    e.lFace = fNew;
    e = e.lNext;
  } while (e !== eOrig);
};


/**
 * killEdge_ destroys an edge (the half-edges eDel and eDel.sym),
 * and removes from the global edge list.
 */
function killEdge_(eDel: GluHalfEdge): void {
  // TODO(bckenny): in this case, no need to worry(?), but check when checking mesh.makeEdgePair_
  // Half-edges are allocated in pairs, see EdgePair above
  //if (eDel.sym < eDel ) { eDel = eDel.sym; }

  // delete from circular doubly-linked list
  var eNext = eDel.next;
  var ePrev = eDel.sym.next;
  eNext.sym.next = ePrev;
  ePrev.sym.next = eNext;

  GluHalfEdge.pool.release(eDel.sym);
  GluHalfEdge.pool.release(eDel);
};


/**
 * killVertex_ destroys a vertex and removes it from the global
 * vertex list. It updates the vertex loop to point to a given new vertex.
 */
function killVertex_(vDel: GluVertex, newOrg: GluVertex): void {
  var eStart = vDel.anEdge;

  // change the origin of all affected edges
  var e = eStart;
  do {
    e.org = newOrg;
    e = e.oNext;
  } while (e !== eStart);

  // delete from circular doubly-linked list
  var vPrev = vDel.prev;
  var vNext = vDel.next;
  vNext.prev = vPrev;
  vPrev.next = vNext;

  GluVertex.pool.release(vDel); 
};


/**
 * killFace_ destroys a face and removes it from the global face
 * list. It updates the face loop to point to a given new face.
 */
export function killFace_(fDel: GluFace, newLFace: GluFace): void {
  var eStart = fDel.anEdge;

  // change the left face of all affected edges
  var e = eStart;
  do {
    e.lFace = newLFace;
    e = e.lNext;
  } while (e !== eStart);

  // delete from circular doubly-linked list
  var fPrev = fDel.prev;
  var fNext = fDel.next;
  fNext.prev = fPrev;
  fPrev.next = fNext;

  GluFace.pool.release(fDel); 
};
