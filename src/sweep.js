/**
 * Copyright 2000, Silicon Graphics, Inc. All Rights Reserved.
 * Copyright 2015, Google Inc. All Rights Reserved.
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
define(["require", "exports", "tslib", "./libtess", "./mesh/GluVertex", "./priorityq/PriorityQ", "./sweep/ActiveRegion", "./geom", "./mesh", "./dict/Dict"], function (require, exports, tslib_1, libtess_1, GluVertex_1, PriorityQ_1, ActiveRegion_1, geom, mesh, Dict_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.computeInterior = void 0;
    geom = tslib_1.__importStar(geom);
    mesh = tslib_1.__importStar(mesh);
    // TODO(bckenny): a number of these never return null (as opposed to original) and should be typed appropriately
    /*
     * Invariants for the Edge Dictionary.
     * - each pair of adjacent edges e2=succ(e1) satisfies edgeLeq_(e1,e2)
     *   at any valid location of the sweep event
     * - if edgeLeq_(e2,e1) as well (at any valid sweep event), then e1 and e2
     *   share a common endpoint
     * - for each e, e.dst() has been processed, but not e.org
     * - each edge e satisfies vertLeq(e.dst(),event) && vertLeq(event,e.org)
     *   where "event" is the current sweep line event.
     * - no edge e has zero length
     *
     * Invariants for the Mesh (the processed portion).
     * - the portion of the mesh left of the sweep line is a planar graph,
     *   ie. there is *some* way to embed it in the plane
     * - no processed edge has zero length
     * - no two processed vertices have identical coordinates
     * - each "inside" region is monotone, ie. can be broken into two chains
     *   of monotonically increasing vertices according to VertLeq(v1,v2)
     *   - a non-invariant: these chains may intersect (very slightly)
     *
     * Invariants for the Sweep.
     * - if none of the edges incident to the event vertex have an activeRegion
     *   (ie. none of these edges are in the edge dictionary), then the vertex
     *   has only right-going edges.
     * - if an edge is marked "fixUpperEdge" (it is a temporary edge introduced
     *   by ConnectRightVertex), then it is the only right-going edge from
     *   its associated vertex.  (This says that these edges exist only
     *   when it is necessary.)
     */
    /**
     * Make the sentinel coordinates big enough that they will never be
     * merged with real input features.  (Even with the largest possible
     * input contour and the maximum tolerance of 1.0, no merging will be
     * done with coordinates larger than 3 * GLU_TESS_MAX_COORD).
     */
    const SENTINEL_COORD_ = 4 * libtess_1.GLU_TESS_MAX_COORD;
    /**
     * Because vertices at exactly the same location are merged together
     * before we process the sweep event, some degenerate cases can't occur.
     * However if someone eventually makes the modifications required to
     * merge features which are close together, the cases below marked
     * TOLERANCE_NONZERO will be useful.  They were debugged before the
     * code to merge identical vertices in the main loop was added.
     */
    const TOLERANCE_NONZERO_ = false;
    /**
     * computeInterior(tess) computes the planar arrangement specified
     * by the given contours, and further subdivides this arrangement
     * into regions. Each region is marked "inside" if it belongs
     * to the polygon, according to the rule given by tess.windingRule.
     * Each interior region is guaranteed be monotone.
     */
    function computeInterior(tess) {
        tess.fatalError = false;
        // Each vertex defines an event for our sweep line. Start by inserting
        // all the vertices in a priority queue. Events are processed in
        // lexicographic order, ie.
        // e1 < e2  iff  e1.x < e2.x || (e1.x == e2.x && e1.y < e2.y)
        removeDegenerateEdges_(tess);
        initPriorityQ_(tess);
        initEdgeDict_(tess);
        var v;
        while ((v = tess.pq.extractMin()) !== null) {
            for (;;) {
                var vNext = tess.pq.minimum();
                if (vNext === null || !geom.vertEq(vNext, v)) {
                    break;
                }
                /* Merge together all vertices at exactly the same location.
                 * This is more efficient than processing them one at a time,
                 * simplifies the code (see connectLeftDegenerate), and is also
                 * important for correct handling of certain degenerate cases.
                 * For example, suppose there are two identical edges A and B
                 * that belong to different contours (so without this code they would
                 * be processed by separate sweep events).  Suppose another edge C
                 * crosses A and B from above.  When A is processed, we split it
                 * at its intersection point with C.  However this also splits C,
                 * so when we insert B we may compute a slightly different
                 * intersection point.  This might leave two edges with a small
                 * gap between them.  This kind of error is especially obvious
                 * when using boundary extraction (GLU_TESS_BOUNDARY_ONLY).
                 */
                vNext = tess.pq.extractMin();
                spliceMergeVertices_(tess, v.anEdge, vNext.anEdge);
            }
            sweepEvent_(tess, v);
        }
        // TODO(bckenny): what does the next comment mean? can we eliminate event except when debugging?
        // Set tess.event for debugging purposes
        var minRegion = tess.dict.getMin().getKey();
        tess.event = minRegion.eUp.org;
        doneEdgeDict_(tess);
        donePriorityQ_(tess);
        removeDegenerateFaces_(tess.mesh);
        tess.mesh.checkMesh();
    }
    exports.computeInterior = computeInterior;
    ;
    /**
     * When we merge two edges into one, we need to compute the combined
     * winding of the new edge.
     */
    function addWinding_(eDst, eSrc) {
        // NOTE(bckenny): from AddWinding macro
        eDst.winding += eSrc.winding;
        eDst.sym.winding += eSrc.sym.winding;
    }
    ;
    /**
     * Both edges must be directed from right to left (this is the canonical
     * direction for the upper edge of each region).
     *
     * The strategy is to evaluate a "t" value for each edge at the
     * current sweep line position, given by tess.event.  The calculations
     * are designed to be very stable, but of course they are not perfect.
     *
     * Special case: if both edge destinations are at the sweep event,
     * we sort the edges by slope (they would otherwise compare equally).
     *
     * @private
     * @param {!GluTesselator} tess
     * @param {!ActiveRegion} reg1
     * @param {!ActiveRegion} reg2
     * @return {boolean}
     */
    function edgeLeq_(tess, reg1, reg2) {
        var event = tess.event;
        var e1 = reg1.eUp;
        var e2 = reg2.eUp;
        if (e1.dst() === event) {
            if (e2.dst() === event) {
                // Two edges right of the sweep line which meet at the sweep event.
                // Sort them by slope.
                if (geom.vertLeq(e1.org, e2.org)) {
                    return geom.edgeSign(e2.dst(), e1.org, e2.org) <= 0;
                }
                return geom.edgeSign(e1.dst(), e2.org, e1.org) >= 0;
            }
            return geom.edgeSign(e2.dst(), event, e2.org) <= 0;
        }
        if (e2.dst() === event) {
            return geom.edgeSign(e1.dst(), event, e1.org) >= 0;
        }
        // General case - compute signed distance *from* e1, e2 to event
        var t1 = geom.edgeEval(e1.dst(), event, e1.org);
        var t2 = geom.edgeEval(e2.dst(), event, e2.org);
        return (t1 >= t2);
    }
    ;
    /**
     * [deleteRegion_ description]
     * @private
     * @param {GluTesselator} tess [description].
     * @param {ActiveRegion} reg [description].
     */
    function deleteRegion_(tess, reg) {
        if (reg.fixUpperEdge) {
            // It was created with zero winding number, so it better be
            // deleted with zero winding number (ie. it better not get merged
            // with a real edge).
            libtess_1.assert(reg.eUp.winding === 0);
        }
        reg.eUp.activeRegion = null;
        tess.dict.deleteNode(reg.nodeUp);
        reg.nodeUp = null;
        // memFree( reg ); TODO(bckenny)
        // TODO(bckenny): may need to null at callsite
    }
    ;
    /**
     * Replace an upper edge which needs fixing (see connectRightVertex).
     */
    function fixUpperEdge_(reg, newEdge) {
        libtess_1.assert(reg.fixUpperEdge);
        mesh.deleteEdge(reg.eUp);
        reg.fixUpperEdge = false;
        reg.eUp = newEdge;
        newEdge.activeRegion = reg;
    }
    ;
    /**
     * Find the region above the uppermost edge with the same origin.
     * @private
     * @param {ActiveRegion} reg [description].
     * @return {ActiveRegion} [description].
     */
    function topLeftRegion_(reg) {
        var org = reg.eUp.org;
        // Find the region above the uppermost edge with the same origin
        do {
            reg = reg.regionAbove();
        } while (reg.eUp.org === org);
        // If the edge above was a temporary edge introduced by connectRightVertex,
        // now is the time to fix it.
        if (reg.fixUpperEdge) {
            var e = mesh.connect(reg.regionBelow().eUp.sym, reg.eUp.lNext);
            fixUpperEdge_(reg, e);
            reg = reg.regionAbove();
        }
        return reg;
    }
    ;
    /**
     * Find the region above the uppermost edge with the same destination.
     */
    function topRightRegion_(reg) {
        var dst = reg.eUp.dst();
        do {
            reg = reg.regionAbove();
        } while (reg.eUp.dst() === dst);
        return reg;
    }
    ;
    /**
     * Add a new active region to the sweep line, *somewhere* below "regAbove"
     * (according to where the new edge belongs in the sweep-line dictionary).
     * The upper edge of the new region will be "eNewUp".
     * Winding number and "inside" flag are not updated.
     */
    function addRegionBelow_(tess, regAbove, eNewUp) {
        var regNew = new ActiveRegion_1.ActiveRegion();
        regNew.eUp = eNewUp;
        regNew.nodeUp = tess.dict.insertBefore(regAbove.nodeUp, regNew);
        eNewUp.activeRegion = regNew;
        return regNew;
    }
    ;
    /**
     * [isWindingInside_ description]
     */
    function isWindingInside_(tess, n) {
        switch (tess.windingRule) {
            case libtess_1.WindingRule.GLU_TESS_WINDING_ODD:
                return ((n & 1) !== 0);
            case libtess_1.WindingRule.GLU_TESS_WINDING_NONZERO:
                return (n !== 0);
            case libtess_1.WindingRule.GLU_TESS_WINDING_POSITIVE:
                return (n > 0);
            case libtess_1.WindingRule.GLU_TESS_WINDING_NEGATIVE:
                return (n < 0);
            case libtess_1.WindingRule.GLU_TESS_WINDING_ABS_GEQ_TWO:
                return (n >= 2) || (n <= -2);
        }
    }
    ;
    /**
     * [computeWinding_ description]
     */
    function computeWinding_(tess, reg) {
        reg.windingNumber = reg.regionAbove().windingNumber + reg.eUp.winding;
        reg.inside = isWindingInside_(tess, reg.windingNumber);
    }
    ;
    /**
     * Delete a region from the sweep line. This happens when the upper
     * and lower chains of a region meet (at a vertex on the sweep line).
     * The "inside" flag is copied to the appropriate mesh face (we could
     * not do this before -- since the structure of the mesh is always
     * changing, this face may not have even existed until now).
     */
    function finishRegion_(tess, reg) {
        // TODO(bckenny): may need to null reg at callsite
        var e = reg.eUp;
        var f = e.lFace;
        f.inside = reg.inside;
        f.anEdge = e; // optimization for tessmono.tessellateMonoRegion() // TODO(bckenny): how so?
        deleteRegion_(tess, reg);
    }
    ;
    /**
     * We are given a vertex with one or more left-going edges. All affected
     * edges should be in the edge dictionary. Starting at regFirst.eUp,
     * we walk down deleting all regions where both edges have the same
     * origin vOrg. At the same time we copy the "inside" flag from the
     * active region to the face, since at this point each face will belong
     * to at most one region (this was not necessarily true until this point
     * in the sweep). The walk stops at the region above regLast; if regLast
     * is null we walk as far as possible. At the same time we relink the
     * mesh if necessary, so that the ordering of edges around vOrg is the
     * same as in the dictionary.
     */
    function finishLeftRegions_(tess, regFirst, regLast) {
        var regPrev = regFirst;
        var ePrev = regFirst.eUp;
        while (regPrev !== regLast) {
            // placement was OK
            regPrev.fixUpperEdge = false;
            var reg = regPrev.regionBelow();
            var e = reg.eUp;
            if (e.org !== ePrev.org) {
                if (!reg.fixUpperEdge) {
                    /* Remove the last left-going edge. Even though there are no further
                     * edges in the dictionary with this origin, there may be further
                     * such edges in the mesh (if we are adding left edges to a vertex
                     * that has already been processed). Thus it is important to call
                     * finishRegion rather than just deleteRegion.
                     */
                    finishRegion_(tess, regPrev);
                    break;
                }
                // If the edge below was a temporary edge introduced by
                // connectRightVertex, now is the time to fix it.
                e = mesh.connect(ePrev.lPrev(), e.sym);
                fixUpperEdge_(reg, e);
            }
            // Relink edges so that ePrev.oNext === e
            if (ePrev.oNext !== e) {
                mesh.meshSplice(e.oPrev(), e);
                mesh.meshSplice(ePrev, e);
            }
            // may change reg.eUp
            finishRegion_(tess, regPrev);
            ePrev = reg.eUp;
            regPrev = reg;
        }
        return ePrev;
    }
    ;
    /**
     * Purpose: insert right-going edges into the edge dictionary, and update
     * winding numbers and mesh connectivity appropriately. All right-going
     * edges share a common origin vOrg. Edges are inserted CCW starting at
     * eFirst; the last edge inserted is eLast.oPrev. If vOrg has any
     * left-going edges already processed, then eTopLeft must be the edge
     * such that an imaginary upward vertical segment from vOrg would be
     * contained between eTopLeft.oPrev and eTopLeft; otherwise eTopLeft
     * should be null.
     */
    function addRightEdges_(tess, regUp, eFirst, eLast, eTopLeft, cleanUp) {
        var firstTime = true;
        // Insert the new right-going edges in the dictionary
        var e = eFirst;
        do {
            libtess_1.assert(geom.vertLeq(e.org, e.dst()));
            addRegionBelow_(tess, regUp, e.sym);
            e = e.oNext;
        } while (e !== eLast);
        // Walk *all* right-going edges from e.org, in the dictionary order,
        // updating the winding numbers of each region, and re-linking the mesh
        // edges to match the dictionary ordering (if necessary).
        if (eTopLeft === null) {
            eTopLeft = regUp.regionBelow().eUp.rPrev();
        }
        var regPrev = regUp;
        var ePrev = eTopLeft;
        var reg;
        for (;;) {
            reg = regPrev.regionBelow();
            e = reg.eUp.sym;
            if (e.org !== ePrev.org) {
                break;
            }
            if (e.oNext !== ePrev) {
                // Unlink e from its current position, and relink below ePrev
                mesh.meshSplice(e.oPrev(), e);
                mesh.meshSplice(ePrev.oPrev(), e);
            }
            // Compute the winding number and "inside" flag for the new regions
            reg.windingNumber = regPrev.windingNumber - e.winding;
            reg.inside = isWindingInside_(tess, reg.windingNumber);
            // Check for two outgoing edges with same slope -- process these
            // before any intersection tests (see example in computeInterior).
            regPrev.dirty = true;
            if (!firstTime && checkForRightSplice_(tess, regPrev)) {
                addWinding_(e, ePrev);
                deleteRegion_(tess, regPrev); // TODO(bckenny): need to null regPrev anywhere else?
                mesh.deleteEdge(ePrev);
            }
            firstTime = false;
            regPrev = reg;
            ePrev = e;
        }
        regPrev.dirty = true;
        libtess_1.assert(regPrev.windingNumber - e.winding === reg.windingNumber);
        if (cleanUp) {
            // Check for intersections between newly adjacent edges.
            walkDirtyRegions_(tess, regPrev);
        }
    }
    ;
    /**
     * Set up data for and call GLU_TESS_COMBINE callback on GluTesselator.
    
     * @param {!GluTesselator} tess
     * @param {!GluVertex} isect A raw vertex at the intersection.
     * @param {!Array<Object>} data The vertices of the intersecting edges.
     * @param {!Array<number>} weights The linear combination coefficients for this intersection.
     * @param {boolean} needed Whether a returned vertex is necessary in this case.
     */
    function callCombine_(tess, isect, data, weights, needed) {
        // Copy coord data in case the callback changes it.
        var coords = [
            isect.coords[0],
            isect.coords[1],
            isect.coords[2]
        ];
        isect.data = null;
        isect.data = tess.callCombineCallback(coords, data, weights);
        if (isect.data === null) {
            if (!needed) {
                // not needed, so just use data from first vertex
                isect.data = data[0];
            }
            else if (!tess.fatalError) {
                // The only way fatal error is when two edges are found to intersect,
                // but the user has not provided the callback necessary to handle
                // generated intersection points.
                tess.callErrorCallback(libtess_1.ErrorType.GLU_TESS_NEED_COMBINE_CALLBACK);
                tess.fatalError = true;
            }
        }
    }
    ;
    /**
     * Two vertices with idential coordinates are combined into one.
     * e1.org is kept, while e2.org is discarded.
     * @private
     * @param {!GluTesselator} tess
     * @param {GluHalfEdge} e1 [description].
     * @param {GluHalfEdge} e2 [description].
     */
    function spliceMergeVertices_(tess, e1, e2) {
        // TODO(bckenny): better way to init these? save them?
        var data = [null, null, null, null];
        var weights = [0.5, 0.5, 0, 0];
        data[0] = e1.org.data;
        data[1] = e2.org.data;
        callCombine_(tess, e1.org, data, weights, false);
        mesh.meshSplice(e1, e2);
    }
    ;
    /**
     * Find some weights which describe how the intersection vertex is
     * a linear combination of org and dst. Each of the two edges
     * which generated "isect" is allocated 50% of the weight; each edge
     * splits the weight between its org and dst according to the
     * relative distance to "isect".
     *
     * @param {number} weightIndex Index into weights for first weight to supply.
     */
    function vertexWeights_(isect, org, dst, weights, weightIndex) {
        // TODO(bckenny): think through how we can use L1dist here and be correct for coords
        var t1 = geom.vertL1dist(org, isect);
        var t2 = geom.vertL1dist(dst, isect);
        // TODO(bckenny): introduced weightIndex to mimic addressing in original
        // 1) document (though it is private and only used from getIntersectData)
        // 2) better way? manually inline into getIntersectData? supply two two-length tmp arrays?
        var i0 = weightIndex;
        var i1 = weightIndex + 1;
        weights[i0] = 0.5 * t2 / (t1 + t2);
        weights[i1] = 0.5 * t1 / (t1 + t2);
        isect.coords[0] += weights[i0] * org.coords[0] + weights[i1] * dst.coords[0];
        isect.coords[1] += weights[i0] * org.coords[1] + weights[i1] * dst.coords[1];
        isect.coords[2] += weights[i0] * org.coords[2] + weights[i1] * dst.coords[2];
    }
    ;
    /**
     * We've computed a new intersection point, now we need a "data" pointer
     * from the user so that we can refer to this new vertex in the
     * rendering callbacks.
     */
    function getIntersectData_(tess, isect, orgUp, dstUp, orgLo, dstLo) {
        // TODO(bckenny): called for every intersection event, should these be from a pool?
        // TODO(bckenny): better way to init these?
        var weights = [0, 0, 0, 0];
        var data = [
            orgUp.data,
            dstUp.data,
            orgLo.data,
            dstLo.data
        ];
        // TODO(bckenny): it appears isect is a reappropriated vertex, so does need to be zeroed.
        // double check this.
        isect.coords[0] = isect.coords[1] = isect.coords[2] = 0;
        // TODO(bckenny): see note in vertexWeights_ for explanation of weightIndex. fix?
        vertexWeights_(isect, orgUp, dstUp, weights, 0);
        vertexWeights_(isect, orgLo, dstLo, weights, 2);
        callCombine_(tess, isect, data, weights, true);
    }
    ;
    /**
     * Check the upper and lower edge of regUp, to make sure that the
     * eUp.org is above eLo, or eLo.org is below eUp (depending on which
     * origin is leftmost).
     *
     * The main purpose is to splice right-going edges with the same
     * dest vertex and nearly identical slopes (ie. we can't distinguish
     * the slopes numerically). However the splicing can also help us
     * to recover from numerical errors. For example, suppose at one
     * point we checked eUp and eLo, and decided that eUp.org is barely
     * above eLo. Then later, we split eLo into two edges (eg. from
     * a splice operation like this one). This can change the result of
     * our test so that now eUp.org is incident to eLo, or barely below it.
     * We must correct this condition to maintain the dictionary invariants.
     *
     * One possibility is to check these edges for intersection again
     * (i.e. checkForIntersect). This is what we do if possible. However
     * checkForIntersect requires that tess.event lies between eUp and eLo,
     * so that it has something to fall back on when the intersection
     * calculation gives us an unusable answer. So, for those cases where
     * we can't check for intersection, this routine fixes the problem
     * by just splicing the offending vertex into the other edge.
     * This is a guaranteed solution, no matter how degenerate things get.
     * Basically this is a combinatorial solution to a numerical problem.
     *
     * @private
     * @param {GluTesselator} tess [description].
     * @param {ActiveRegion} regUp [description].
     * @return {boolean} [description].
     */
    function checkForRightSplice_(tess, regUp) {
        // TODO(bckenny): fully learn how these two checks work
        var regLo = regUp.regionBelow();
        var eUp = regUp.eUp;
        var eLo = regLo.eUp;
        if (geom.vertLeq(eUp.org, eLo.org)) {
            if (geom.edgeSign(eLo.dst(), eUp.org, eLo.org) > 0) {
                return false;
            }
            // eUp.org appears to be below eLo
            if (!geom.vertEq(eUp.org, eLo.org)) {
                // Splice eUp.org into eLo
                mesh.splitEdge(eLo.sym);
                mesh.meshSplice(eUp, eLo.oPrev());
                regUp.dirty = regLo.dirty = true;
            }
            else if (eUp.org !== eLo.org) {
                // merge the two vertices, discarding eUp.org
                tess.pq.remove(eUp.org.pqHandle);
                spliceMergeVertices_(tess, eLo.oPrev(), eUp);
            }
        }
        else {
            if (geom.edgeSign(eUp.dst(), eLo.org, eUp.org) < 0) {
                return false;
            }
            // eLo.org appears to be above eUp, so splice eLo.org into eUp
            regUp.regionAbove().dirty = regUp.dirty = true;
            mesh.splitEdge(eUp.sym);
            mesh.meshSplice(eLo.oPrev(), eUp);
        }
        return true;
    }
    ;
    /**
     * Check the upper and lower edge of regUp to make sure that the
     * eUp.dst() is above eLo, or eLo.dst() is below eUp (depending on which
     * destination is rightmost).
     *
     * Theoretically, this should always be true. However, splitting an edge
     * into two pieces can change the results of previous tests. For example,
     * suppose at one point we checked eUp and eLo, and decided that eUp.dst()
     * is barely above eLo. Then later, we split eLo into two edges (eg. from
     * a splice operation like this one). This can change the result of
     * the test so that now eUp.dst() is incident to eLo, or barely below it.
     * We must correct this condition to maintain the dictionary invariants
     * (otherwise new edges might get inserted in the wrong place in the
     * dictionary, and bad stuff will happen).
     *
     * We fix the problem by just splicing the offending vertex into the
     * other edge.
     *
     * @private
     * @param {GluTesselator} tess description].
     * @param {ActiveRegion} regUp [description].
     * @return {boolean} [description].
     */
    function checkForLeftSplice_(_tess, regUp) {
        var regLo = regUp.regionBelow();
        var eUp = regUp.eUp;
        var eLo = regLo.eUp;
        var e;
        libtess_1.assert(!geom.vertEq(eUp.dst(), eLo.dst()));
        if (geom.vertLeq(eUp.dst(), eLo.dst())) {
            if (geom.edgeSign(eUp.dst(), eLo.dst(), eUp.org) < 0) {
                return false;
            }
            // eLo.dst() is above eUp, so splice eLo.dst() into eUp
            regUp.regionAbove().dirty = regUp.dirty = true;
            e = mesh.splitEdge(eUp);
            mesh.meshSplice(eLo.sym, e);
            e.lFace.inside = regUp.inside;
        }
        else {
            if (geom.edgeSign(eLo.dst(), eUp.dst(), eLo.org) > 0) {
                return false;
            }
            // eUp.dst() is below eLo, so splice eUp.dst() into eLo
            regUp.dirty = regLo.dirty = true;
            e = mesh.splitEdge(eLo);
            mesh.meshSplice(eUp.lNext, eLo.sym);
            e.rFace().inside = regUp.inside;
        }
        return true;
    }
    ;
    /**
     * Check the upper and lower edges of the given region to see if
     * they intersect. If so, create the intersection and add it
     * to the data structures.
     *
     * Returns true if adding the new intersection resulted in a recursive
     * call to addRightEdges_(); in this case all "dirty" regions have been
     * checked for intersections, and possibly regUp has been deleted.
     *
     * @private
     * @param {GluTesselator} tess [description].
     * @param {ActiveRegion} regUp [description].
     * @return {boolean} [description].
     */
    function checkForIntersect_(tess, regUp) {
        var regLo = regUp.regionBelow();
        var eUp = regUp.eUp;
        var eLo = regLo.eUp;
        var orgUp = eUp.org;
        var orgLo = eLo.org;
        var dstUp = eUp.dst();
        var dstLo = eLo.dst();
        var isect = new GluVertex_1.GluVertex();
        libtess_1.assert(!geom.vertEq(dstLo, dstUp));
        libtess_1.assert(geom.edgeSign(dstUp, tess.event, orgUp) <= 0);
        libtess_1.assert(geom.edgeSign(dstLo, tess.event, orgLo) >= 0);
        libtess_1.assert(orgUp !== tess.event && orgLo !== tess.event);
        libtess_1.assert(!regUp.fixUpperEdge && !regLo.fixUpperEdge);
        if (orgUp === orgLo) {
            // right endpoints are the same
            return false;
        }
        var tMinUp = Math.min(orgUp.t, dstUp.t);
        var tMaxLo = Math.max(orgLo.t, dstLo.t);
        if (tMinUp > tMaxLo) {
            // t ranges do not overlap
            return false;
        }
        if (geom.vertLeq(orgUp, orgLo)) {
            if (geom.edgeSign(dstLo, orgUp, orgLo) > 0) {
                return false;
            }
        }
        else {
            if (geom.edgeSign(dstUp, orgLo, orgUp) < 0) {
                return false;
            }
        }
        // At this point the edges intersect, at least marginally
        geom.edgeIntersect(dstUp, orgUp, dstLo, orgLo, isect);
        // The following properties are guaranteed:
        libtess_1.assert(Math.min(orgUp.t, dstUp.t) <= isect.t);
        libtess_1.assert(isect.t <= Math.max(orgLo.t, dstLo.t));
        libtess_1.assert(Math.min(dstLo.s, dstUp.s) <= isect.s);
        libtess_1.assert(isect.s <= Math.max(orgLo.s, orgUp.s));
        if (geom.vertLeq(isect, tess.event)) {
            /* The intersection point lies slightly to the left of the sweep line,
             * so move it until it's slightly to the right of the sweep line.
             * (If we had perfect numerical precision, this would never happen
             * in the first place). The easiest and safest thing to do is
             * replace the intersection by tess.event.
             */
            isect.s = tess.event.s;
            isect.t = tess.event.t;
        }
        // TODO(bckenny): try to find test54.d
        /* Similarly, if the computed intersection lies to the right of the
         * rightmost origin (which should rarely happen), it can cause
         * unbelievable inefficiency on sufficiently degenerate inputs.
         * (If you have the test program, try running test54.d with the
         * "X zoom" option turned on).
         */
        var orgMin = geom.vertLeq(orgUp, orgLo) ? orgUp : orgLo;
        if (geom.vertLeq(orgMin, isect)) {
            isect.s = orgMin.s;
            isect.t = orgMin.t;
        }
        if (geom.vertEq(isect, orgUp) || geom.vertEq(isect, orgLo)) {
            // Easy case -- intersection at one of the right endpoints
            checkForRightSplice_(tess, regUp);
            return false;
        }
        // TODO(bckenny): clean this up; length is distracting
        if ((!geom.vertEq(dstUp, tess.event) &&
            geom.edgeSign(dstUp, tess.event, isect) >= 0) ||
            (!geom.vertEq(dstLo, tess.event) &&
                geom.edgeSign(dstLo, tess.event, isect) <= 0)) {
            /* Very unusual -- the new upper or lower edge would pass on the
             * wrong side of the sweep event, or through it. This can happen
             * due to very small numerical errors in the intersection calculation.
             */
            if (dstLo === tess.event) {
                // Splice dstLo into eUp, and process the new region(s)
                mesh.splitEdge(eUp.sym);
                mesh.meshSplice(eLo.sym, eUp);
                regUp = topLeftRegion_(regUp);
                eUp = regUp.regionBelow().eUp;
                finishLeftRegions_(tess, regUp.regionBelow(), regLo);
                addRightEdges_(tess, regUp, eUp.oPrev(), eUp, eUp, true);
                return true;
            }
            if (dstUp === tess.event) {
                // Splice dstUp into eLo, and process the new region(s)
                mesh.splitEdge(eLo.sym);
                mesh.meshSplice(eUp.lNext, eLo.oPrev());
                regLo = regUp;
                regUp = topRightRegion_(regUp);
                var e = regUp.regionBelow().eUp.rPrev();
                regLo.eUp = eLo.oPrev();
                eLo = finishLeftRegions_(tess, regLo, null);
                addRightEdges_(tess, regUp, eLo.oNext, eUp.rPrev(), e, true);
                return true;
            }
            /* Special case: called from connectRightVertex. If either
             * edge passes on the wrong side of tess.event, split it
             * (and wait for connectRightVertex to splice it appropriately).
             */
            if (geom.edgeSign(dstUp, tess.event, isect) >= 0) {
                regUp.regionAbove().dirty = regUp.dirty = true;
                mesh.splitEdge(eUp.sym);
                eUp.org.s = tess.event.s;
                eUp.org.t = tess.event.t;
            }
            if (geom.edgeSign(dstLo, tess.event, isect) <= 0) {
                regUp.dirty = regLo.dirty = true;
                mesh.splitEdge(eLo.sym);
                eLo.org.s = tess.event.s;
                eLo.org.t = tess.event.t;
            }
            // leave the rest for connectRightVertex
            return false;
        }
        /* General case -- split both edges, splice into new vertex.
         * When we do the splice operation, the order of the arguments is
         * arbitrary as far as correctness goes. However, when the operation
         * creates a new face, the work done is proportional to the size of
         * the new face. We expect the faces in the processed part of
         * the mesh (ie. eUp.lFace) to be smaller than the faces in the
         * unprocessed original contours (which will be eLo.oPrev.lFace).
         */
        mesh.splitEdge(eUp.sym);
        mesh.splitEdge(eLo.sym);
        mesh.meshSplice(eLo.oPrev(), eUp);
        eUp.org.s = isect.s;
        eUp.org.t = isect.t;
        eUp.org.pqHandle = tess.pq.insert(eUp.org);
        getIntersectData_(tess, eUp.org, orgUp, dstUp, orgLo, dstLo);
        regUp.regionAbove().dirty = regUp.dirty = regLo.dirty = true;
        return false;
    }
    ;
    /**
     * When the upper or lower edge of any region changes, the region is
     * marked "dirty". This routine walks through all the dirty regions
     * and makes sure that the dictionary invariants are satisfied
     * (see the comments at the beginning of this file). Of course,
     * new dirty regions can be created as we make changes to restore
     * the invariants.
     * @private
     * @param {GluTesselator} tess [description].
     * @param {ActiveRegion} regUp [description].
     */
    function walkDirtyRegions_(tess, regUp) {
        var regLo = regUp.regionBelow();
        for (;;) {
            // Find the lowest dirty region (we walk from the bottom up).
            while (regLo.dirty) {
                regUp = regLo;
                regLo = regLo.regionBelow();
            }
            if (!regUp.dirty) {
                regLo = regUp;
                regUp = regUp.regionAbove();
                if (regUp === null || !regUp.dirty) {
                    // We've walked all the dirty regions
                    return;
                }
            }
            regUp.dirty = false;
            var eUp = regUp.eUp;
            var eLo = regLo.eUp;
            if (eUp.dst() !== eLo.dst()) {
                // Check that the edge ordering is obeyed at the dst vertices.
                if (checkForLeftSplice_(tess, regUp)) {
                    // If the upper or lower edge was marked fixUpperEdge, then
                    // we no longer need it (since these edges are needed only for
                    // vertices which otherwise have no right-going edges).
                    if (regLo.fixUpperEdge) {
                        deleteRegion_(tess, regLo);
                        mesh.deleteEdge(eLo);
                        regLo = regUp.regionBelow();
                        eLo = regLo.eUp;
                    }
                    else if (regUp.fixUpperEdge) {
                        deleteRegion_(tess, regUp);
                        mesh.deleteEdge(eUp);
                        regUp = regLo.regionAbove();
                        eUp = regUp.eUp;
                    }
                }
            }
            if (eUp.org !== eLo.org) {
                if (eUp.dst() !== eLo.dst() && !regUp.fixUpperEdge &&
                    !regLo.fixUpperEdge &&
                    (eUp.dst() === tess.event || eLo.dst() === tess.event)) {
                    /* When all else fails in checkForIntersect(), it uses tess.event
                     * as the intersection location. To make this possible, it requires
                     * that tess.event lie between the upper and lower edges, and also
                     * that neither of these is marked fixUpperEdge (since in the worst
                     * case it might splice one of these edges into tess.event, and
                     * violate the invariant that fixable edges are the only right-going
                     * edge from their associated vertex).
                     */
                    if (checkForIntersect_(tess, regUp)) {
                        // walkDirtyRegions() was called recursively; we're done
                        return;
                    }
                }
                else {
                    // Even though we can't use checkForIntersect(), the org vertices
                    // may violate the dictionary edge ordering. Check and correct this.
                    checkForRightSplice_(tess, regUp);
                }
            }
            if (eUp.org === eLo.org && eUp.dst() === eLo.dst()) {
                // A degenerate loop consisting of only two edges -- delete it.
                addWinding_(eLo, eUp);
                deleteRegion_(tess, regUp);
                mesh.deleteEdge(eUp);
                regUp = regLo.regionAbove();
            }
        }
    }
    ;
    /**
     * Purpose: connect a "right" vertex vEvent (one where all edges go left)
     * to the unprocessed portion of the mesh. Since there are no right-going
     * edges, two regions (one above vEvent and one below) are being merged
     * into one. regUp is the upper of these two regions.
     *
     * There are two reasons for doing this (adding a right-going edge):
     *  - if the two regions being merged are "inside", we must add an edge
     *    to keep them separated (the combined region would not be monotone).
     *  - in any case, we must leave some record of vEvent in the dictionary,
     *    so that we can merge vEvent with features that we have not seen yet.
     *    For example, maybe there is a vertical edge which passes just to
     *    the right of vEvent; we would like to splice vEvent into this edge.
     *
     * However, we don't want to connect vEvent to just any vertex. We don't
     * want the new edge to cross any other edges; otherwise we will create
     * intersection vertices even when the input data had no self-intersections.
     * (This is a bad thing; if the user's input data has no intersections,
     * we don't want to generate any false intersections ourselves.)
     *
     * Our eventual goal is to connect vEvent to the leftmost unprocessed
     * vertex of the combined region (the union of regUp and regLo).
     * But because of unseen vertices with all right-going edges, and also
     * new vertices which may be created by edge intersections, we don't
     * know where that leftmost unprocessed vertex is. In the meantime, we
     * connect vEvent to the closest vertex of either chain, and mark the region
     * as "fixUpperEdge". This flag says to delete and reconnect this edge
     * to the next processed vertex on the boundary of the combined region.
     * Quite possibly the vertex we connected to will turn out to be the
     * closest one, in which case we won't need to make any changes.
     *
     * @private
     * @param {GluTesselator} tess [description].
     * @param {ActiveRegion} regUp [description].
     * @param {GluHalfEdge} eBottomLeft [description].
     */
    function connectRightVertex_(tess, regUp, eBottomLeft) {
        var eTopLeft = eBottomLeft.oNext;
        var regLo = regUp.regionBelow();
        var eUp = regUp.eUp;
        var eLo = regLo.eUp;
        var degenerate = false;
        if (eUp.dst() !== eLo.dst()) {
            checkForIntersect_(tess, regUp);
        }
        // Possible new degeneracies: upper or lower edge of regUp may pass
        // through vEvent, or may coincide with new intersection vertex
        if (geom.vertEq(eUp.org, tess.event)) {
            mesh.meshSplice(eTopLeft.oPrev(), eUp);
            regUp = topLeftRegion_(regUp);
            eTopLeft = regUp.regionBelow().eUp;
            finishLeftRegions_(tess, regUp.regionBelow(), regLo);
            degenerate = true;
        }
        if (geom.vertEq(eLo.org, tess.event)) {
            mesh.meshSplice(eBottomLeft, eLo.oPrev());
            eBottomLeft = finishLeftRegions_(tess, regLo, null);
            degenerate = true;
        }
        if (degenerate) {
            addRightEdges_(tess, regUp, eBottomLeft.oNext, eTopLeft, eTopLeft, true);
            return;
        }
        // Non-degenerate situation -- need to add a temporary, fixable edge.
        // Connect to the closer of eLo.org, eUp.org.
        var eNew;
        if (geom.vertLeq(eLo.org, eUp.org)) {
            eNew = eLo.oPrev();
        }
        else {
            eNew = eUp;
        }
        eNew = mesh.connect(eBottomLeft.lPrev(), eNew);
        // Prevent cleanup, otherwise eNew might disappear before we've even
        // had a chance to mark it as a temporary edge.
        addRightEdges_(tess, regUp, eNew, eNew.oNext, eNew.oNext, false);
        eNew.sym.activeRegion.fixUpperEdge = true;
        walkDirtyRegions_(tess, regUp);
    }
    ;
    /**
     * The event vertex lies exacty on an already-processed edge or vertex.
     * Adding the new vertex involves splicing it into the already-processed
     * part of the mesh.
     * @private
     * @param {!GluTesselator} tess
     * @param {ActiveRegion} regUp [description].
     * @param {GluVertex} vEvent [description].
     */
    function connectLeftDegenerate_(tess, regUp, vEvent) {
        var e = regUp.eUp;
        /* istanbul ignore if */
        if (geom.vertEq(e.org, vEvent)) {
            // NOTE(bckenny): this code is unreachable but remains for a hypothetical
            // future extension of  See docs on TOLERANCE_NONZERO_
            // for more information. Conditional on TOLERANCE_NONZERO_ to help Closure
            // Compiler eliminate dead code.
            // e.org is an unprocessed vertex - just combine them, and wait
            // for e.org to be pulled from the queue
            libtess_1.assert(TOLERANCE_NONZERO_);
            if (TOLERANCE_NONZERO_) {
                spliceMergeVertices_(tess, e, vEvent.anEdge);
            }
            return;
        }
        if (!geom.vertEq(e.dst(), vEvent)) {
            // General case -- splice vEvent into edge e which passes through it
            mesh.splitEdge(e.sym);
            if (regUp.fixUpperEdge) {
                // This edge was fixable -- delete unused portion of original edge
                mesh.deleteEdge(e.oNext);
                regUp.fixUpperEdge = false;
            }
            mesh.meshSplice(vEvent.anEdge, e);
            // recurse
            sweepEvent_(tess, vEvent);
            return;
        }
        // NOTE(bckenny): this code is unreachable but remains for a hypothetical
        // future extension of  See docs on TOLERANCE_NONZERO_
        // for more information. Conditional on TOLERANCE_NONZERO_ to help Closure
        // Compiler eliminate dead code.
        // vEvent coincides with e.dst(), which has already been processed.
        // Splice in the additional right-going edges.
        /* istanbul ignore next */
        libtess_1.assert(TOLERANCE_NONZERO_);
        /* istanbul ignore next */
        if (TOLERANCE_NONZERO_) {
            regUp = topRightRegion_(regUp);
            var reg = regUp.regionBelow();
            var eTopRight = reg.eUp.sym;
            var eTopLeft = eTopRight.oNext;
            var eLast = eTopLeft;
            if (reg.fixUpperEdge) {
                // Here e.dst() has only a single fixable edge going right.
                // We can delete it since now we have some real right-going edges.
                // there are some left edges too
                libtess_1.assert(eTopLeft !== eTopRight);
                deleteRegion_(tess, reg); // TODO(bckenny): something to null?
                mesh.deleteEdge(eTopRight);
                eTopRight = eTopLeft.oPrev();
            }
            mesh.meshSplice(vEvent.anEdge, eTopRight);
            if (!geom.edgeGoesLeft(eTopLeft)) {
                // e.dst() had no left-going edges -- indicate this to addRightEdges()
                eTopLeft = null;
            }
            addRightEdges_(tess, regUp, eTopRight.oNext, eLast, eTopLeft, true);
        }
    }
    ;
    /**
     * Connect a "left" vertex (one where both edges go right)
     * to the processed portion of the mesh. Let R be the active region
     * containing vEvent, and let U and L be the upper and lower edge
     * chains of R. There are two possibilities:
     *
     * - the normal case: split R into two regions, by connecting vEvent to
     *   the rightmost vertex of U or L lying to the left of the sweep line
     *
     * - the degenerate case: if vEvent is close enough to U or L, we
     *   merge vEvent into that edge chain. The subcases are:
     *  - merging with the rightmost vertex of U or L
     *  - merging with the active edge of U or L
     *  - merging with an already-processed portion of U or L
     *
     * @private
     * @param {GluTesselator} tess   [description].
     * @param {GluVertex} vEvent [description].
     */
    function connectLeftVertex_(tess, vEvent) {
        // TODO(bckenny): tmp only used for sweep. better to keep tmp across calls?
        var tmp = new ActiveRegion_1.ActiveRegion();
        // NOTE(bckenny): this was commented out in the original
        // assert(vEvent.anEdge.oNext.oNext === vEvent.anEdge);
        // Get a pointer to the active region containing vEvent
        tmp.eUp = vEvent.anEdge.sym;
        var regUp = tess.dict.search(tmp).getKey();
        var regLo = regUp.regionBelow();
        var eUp = regUp.eUp;
        var eLo = regLo.eUp;
        // try merging with U or L first
        if (geom.edgeSign(eUp.dst(), vEvent, eUp.org) === 0) {
            connectLeftDegenerate_(tess, regUp, vEvent);
            return;
        }
        // Connect vEvent to rightmost processed vertex of either chain.
        // e.dst() is the vertex that we will connect to vEvent.
        var reg = geom.vertLeq(eLo.dst(), eUp.dst()) ? regUp : regLo;
        var eNew;
        if (regUp.inside || reg.fixUpperEdge) {
            if (reg === regUp) {
                eNew = mesh.connect(vEvent.anEdge.sym, eUp.lNext);
            }
            else {
                var tempHalfEdge = mesh.connect(eLo.dNext(), vEvent.anEdge);
                eNew = tempHalfEdge.sym;
            }
            if (reg.fixUpperEdge) {
                fixUpperEdge_(reg, eNew);
            }
            else {
                computeWinding_(tess, addRegionBelow_(tess, regUp, eNew));
            }
            sweepEvent_(tess, vEvent);
        }
        else {
            // The new vertex is in a region which does not belong to the polygon.
            // We don''t need to connect this vertex to the rest of the mesh.
            addRightEdges_(tess, regUp, vEvent.anEdge, vEvent.anEdge, null, true);
        }
    }
    ;
    /**
     * Does everything necessary when the sweep line crosses a vertex.
     * Updates the mesh and the edge dictionary.
     * @private
     * @param {GluTesselator} tess [description].
     * @param {GluVertex} vEvent [description].
     */
    function sweepEvent_(tess, vEvent) {
        tess.event = vEvent; // for access in edgeLeq_ // TODO(bckenny): wuh?
        /* Check if this vertex is the right endpoint of an edge that is
         * already in the dictionary.  In this case we don't need to waste
         * time searching for the location to insert new edges.
         */
        var e = vEvent.anEdge;
        while (e.activeRegion === null) {
            e = e.oNext;
            if (e === vEvent.anEdge) {
                // All edges go right -- not incident to any processed edges
                connectLeftVertex_(tess, vEvent);
                return;
            }
        }
        /* Processing consists of two phases: first we "finish" all the
         * active regions where both the upper and lower edges terminate
         * at vEvent (ie. vEvent is closing off these regions).
         * We mark these faces "inside" or "outside" the polygon according
         * to their winding number, and delete the edges from the dictionary.
         * This takes care of all the left-going edges from vEvent.
         */
        var regUp = topLeftRegion_(e.activeRegion);
        var reg = regUp.regionBelow();
        var eTopLeft = reg.eUp;
        var eBottomLeft = finishLeftRegions_(tess, reg, null);
        /* Next we process all the right-going edges from vEvent. This
         * involves adding the edges to the dictionary, and creating the
         * associated "active regions" which record information about the
         * regions between adjacent dictionary edges.
         */
        if (eBottomLeft.oNext === eTopLeft) {
            // No right-going edges -- add a temporary "fixable" edge
            connectRightVertex_(tess, regUp, eBottomLeft);
        }
        else {
            addRightEdges_(tess, regUp, eBottomLeft.oNext, eTopLeft, eTopLeft, true);
        }
    }
    ;
    /**
     * We add two sentinel edges above and below all other edges,
     * to avoid special cases at the top and bottom.
     * @private
     * @param {GluTesselator} tess [description].
     * @param {number} t [description].
     */
    function addSentinel_(tess, t) {
        var reg = new ActiveRegion_1.ActiveRegion();
        var e = mesh.makeEdge(tess.mesh);
        e.org.s = SENTINEL_COORD_;
        e.org.t = t;
        e.dst().s = -SENTINEL_COORD_;
        e.dst().t = t;
        tess.event = e.dst(); //initialize it
        reg.eUp = e;
        reg.windingNumber = 0;
        reg.inside = false;
        reg.fixUpperEdge = false;
        reg.sentinel = true;
        reg.dirty = false;
        reg.nodeUp = tess.dict.insert(reg);
    }
    ;
    /**
     * We maintain an ordering of edge intersections with the sweep line.
     * This order is maintained in a dynamic dictionary.
     * @private
     * @param {GluTesselator} tess [description].
     */
    function initEdgeDict_(tess) {
        tess.dict = new Dict_1.Dict(tess, edgeLeq_);
        addSentinel_(tess, -SENTINEL_COORD_);
        addSentinel_(tess, SENTINEL_COORD_);
    }
    ;
    /**
     * [doneEdgeDict_ description]
     * @private
     * @param {GluTesselator} tess [description].
     */
    function doneEdgeDict_(tess) {
        // NOTE(bckenny): fixedEdges is only used in the assert below, so ignore so
        // when asserts are removed jshint won't error.
        /* jshint unused:false */
        var fixedEdges = 0;
        var reg;
        while ((reg = tess.dict.getMin().getKey()) !== null) {
            // At the end of all processing, the dictionary should contain
            // only the two sentinel edges, plus at most one "fixable" edge
            // created by connectRightVertex().
            if (!reg.sentinel) {
                libtess_1.assert(reg.fixUpperEdge);
                libtess_1.assert(++fixedEdges === 1);
            }
            libtess_1.assert(reg.windingNumber === 0);
            deleteRegion_(tess, reg);
        }
        // NOTE(bckenny): see tess.dict.deleteDict_() for old delete dict function
        tess.dict = null;
    }
    ;
    /**
     * Remove zero-length edges, and contours with fewer than 3 vertices.
     * @private
     * @param {GluTesselator} tess [description].
     */
    function removeDegenerateEdges_(tess) {
        var eHead = tess.mesh.eHead;
        var eNext;
        for (var e = eHead.next; e !== eHead; e = eNext) {
            eNext = e.next;
            var eLNext = e.lNext;
            if (geom.vertEq(e.org, e.dst()) && e.lNext.lNext !== e) {
                // Zero-length edge, contour has at least 3 edges
                spliceMergeVertices_(tess, eLNext, e); // deletes e.org
                mesh.deleteEdge(e); // e is a self-loop TODO(bckenny): does this comment really apply here?
                e = eLNext;
                eLNext = e.lNext;
            }
            if (eLNext.lNext === e) {
                // Degenerate contour (one or two edges)
                if (eLNext !== e) {
                    if (eLNext === eNext || eLNext === eNext.sym) {
                        eNext = eNext.next;
                    }
                    mesh.deleteEdge(eLNext);
                }
                if (e === eNext || e === eNext.sym) {
                    eNext = eNext.next;
                }
                mesh.deleteEdge(e);
            }
        }
    }
    ;
    /**
     * Construct priority queue and insert all vertices into it, which determines
     * the order in which vertices cross the sweep line.
     * @private
     * @param {GluTesselator} tess [description].
     */
    function initPriorityQ_(tess) {
        var pq = new PriorityQ_1.PriorityQ();
        tess.pq = pq;
        var vHead = tess.mesh.vHead;
        var v;
        for (v = vHead.next; v !== vHead; v = v.next) {
            v.pqHandle = pq.insert(v);
        }
        pq.init();
    }
    ;
    /**
     * [donePriorityQ_ description]
     * @private
     * @param {GluTesselator} tess [description].
     */
    function donePriorityQ_(tess) {
        // TODO(bckenny): probably don't need deleteQ. check that function for comment
        tess.pq.deleteQ();
        tess.pq = null;
    }
    ;
    /**
     * Delete any degenerate faces with only two edges. walkDirtyRegions()
     * will catch almost all of these, but it won't catch degenerate faces
     * produced by splice operations on already-processed edges.
     * The two places this can happen are in finishLeftRegions(), when
     * we splice in a "temporary" edge produced by connectRightVertex(),
     * and in checkForLeftSplice(), where we splice already-processed
     * edges to ensure that our dictionary invariants are not violated
     * by numerical errors.
     *
     * In both these cases it is *very* dangerous to delete the offending
     * edge at the time, since one of the routines further up the stack
     * will sometimes be keeping a pointer to that edge.
     *
     * @private
     * @param {GluMesh} mesh [description].
     */
    function removeDegenerateFaces_(gluMesh) {
        var fNext;
        for (var f = gluMesh.fHead.next; f !== gluMesh.fHead; f = fNext) {
            fNext = f.next;
            var e = f.anEdge;
            libtess_1.assert(e.lNext !== e);
            if (e.lNext.lNext === e) {
                // A face with only two edges
                addWinding_(e.oNext, e);
                mesh.deleteEdge(e);
            }
        }
    }
    ;
});
