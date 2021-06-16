/**
 * Copyright 2000, Silicon Graphics, Inc. All Rights Reserved.
 * Copyright 2014, Google Inc. All Rights Reserved.
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
define(["require", "exports", "./libtess"], function (require, exports, libtess_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.edgeIntersect = exports.vertCCW = exports.vertL1dist = exports.edgeGoesRight = exports.edgeGoesLeft = exports.transSign = exports.transEval = exports.transLeq = exports.edgeSign = exports.edgeEval = exports.vertLeq = exports.vertEq = void 0;
    /**
     * Returns whether vertex u and vertex v are equal.
     */
    function vertEq(u, v) {
        return u.s === v.s && u.t === v.t;
    }
    exports.vertEq = vertEq;
    ;
    /**
     * Returns whether vertex u is lexicographically less than or equal to vertex v.
     */
    function vertLeq(u, v) {
        return (u.s < v.s) || (u.s === v.s && u.t <= v.t);
    }
    exports.vertLeq = vertLeq;
    ;
    /**
     * Given three vertices u,v,w such that geom.vertLeq(u,v) && geom.vertLeq(v,w),
     * evaluates the t-coord of the edge uw at the s-coord of the vertex v.
     * Returns v.t - (uw)(v.s), ie. the signed distance from uw to v.
     * If uw is vertical (and thus passes thru v), the result is zero.
     *
     * The calculation is extremely accurate and stable, even when v
     * is very close to u or w.  In particular if we set v.t = 0 and
     * let r be the negated result (this evaluates (uw)(v.s)), then
     * r is guaranteed to satisfy MIN(u.t,w.t) <= r <= MAX(u.t,w.t).
     */
    function edgeEval(u, v, w) {
        libtess_1.assert(vertLeq(u, v) && vertLeq(v, w));
        var gapL = v.s - u.s;
        var gapR = w.s - v.s;
        if (gapL + gapR > 0) {
            if (gapL < gapR) {
                return (v.t - u.t) + (u.t - w.t) * (gapL / (gapL + gapR));
            }
            else {
                return (v.t - w.t) + (w.t - u.t) * (gapR / (gapL + gapR));
            }
        }
        // vertical line
        return 0;
    }
    exports.edgeEval = edgeEval;
    ;
    /**
     * Returns a number whose sign matches geom.edgeEval(u,v,w) but which
     * is cheaper to evaluate.  Returns > 0, == 0 , or < 0
     * as v is above, on, or below the edge uw.
     */
    function edgeSign(u, v, w) {
        libtess_1.assert(vertLeq(u, v) && vertLeq(v, w));
        var gapL = v.s - u.s;
        var gapR = w.s - v.s;
        if (gapL + gapR > 0) {
            return (v.t - w.t) * gapL + (v.t - u.t) * gapR;
        }
        // vertical line
        return 0;
    }
    exports.edgeSign = edgeSign;
    ;
    /**
     * Version of VertLeq with s and t transposed.
     * Returns whether vertex u is lexicographically less than or equal to vertex v.
     */
    function transLeq(u, v) {
        return (u.t < v.t) || (u.t === v.t && u.s <= v.s);
    }
    exports.transLeq = transLeq;
    ;
    /**
     * Version of geom.edgeEval with s and t transposed.
     * Given three vertices u,v,w such that geom.transLeq(u,v) &&
     * geom.transLeq(v,w), evaluates the t-coord of the edge uw at the s-coord of
     * the vertex v. Returns v.s - (uw)(v.t), ie. the signed distance from uw to v.
     * If uw is vertical (and thus passes thru v), the result is zero.
     *
     * The calculation is extremely accurate and stable, even when v
     * is very close to u or w.  In particular if we set v.s = 0 and
     * let r be the negated result (this evaluates (uw)(v.t)), then
     * r is guaranteed to satisfy MIN(u.s,w.s) <= r <= MAX(u.s,w.s).
     */
    function transEval(u, v, w) {
        libtess_1.assert(transLeq(u, v) && transLeq(v, w));
        var gapL = v.t - u.t;
        var gapR = w.t - v.t;
        if (gapL + gapR > 0) {
            if (gapL < gapR) {
                return (v.s - u.s) + (u.s - w.s) * (gapL / (gapL + gapR));
            }
            else {
                return (v.s - w.s) + (w.s - u.s) * (gapR / (gapL + gapR));
            }
        }
        // vertical line
        return 0;
    }
    exports.transEval = transEval;
    ;
    /**
     * Version of geom.edgeSign with s and t transposed.
     * Returns a number whose sign matches geom.transEval(u,v,w) but which
     * is cheaper to evaluate.  Returns > 0, == 0 , or < 0
     * as v is above, on, or below the edge uw.
     */
    function transSign(u, v, w) {
        libtess_1.assert(transLeq(u, v) && transLeq(v, w));
        var gapL = v.t - u.t;
        var gapR = w.t - v.t;
        if (gapL + gapR > 0) {
            return (v.s - w.s) * gapL + (v.s - u.s) * gapR;
        }
        // vertical line
        return 0;
    }
    exports.transSign = transSign;
    ;
    /**
     * Returns whether edge is directed from right to left.
     */
    function edgeGoesLeft(e) {
        return vertLeq(e.dst(), e.org);
    }
    exports.edgeGoesLeft = edgeGoesLeft;
    ;
    /**
     * Returns whether edge is directed from left to right.
     */
    function edgeGoesRight(e) {
        return vertLeq(e.org, e.dst());
    }
    exports.edgeGoesRight = edgeGoesRight;
    ;
    /**
     * Calculates the L1 distance between vertices u and v.
     */
    function vertL1dist(u, v) {
        return Math.abs(u.s - v.s) + Math.abs(u.t - v.t);
    }
    exports.vertL1dist = vertL1dist;
    ;
    // NOTE(bckenny): vertCCW is called nowhere in libtess and isn't part of the
    // public API.
    /**
     * For almost-degenerate situations, the results are not reliable.
     * Unless the floating-point arithmetic can be performed without
     * rounding errors, *any* implementation will give incorrect results
     * on some degenerate inputs, so the client must have some way to
     * handle this situation.
     */
    function vertCCW(u, v, w) {
        return (u.s * (v.t - w.t) + v.s * (w.t - u.t) + w.s * (u.t - v.t)) >= 0;
    }
    exports.vertCCW = vertCCW;
    ;
    /**
     * Given parameters a,x,b,y returns the value (b*x+a*y)/(a+b),
     * or (x+y)/2 if a==b==0. It requires that a,b >= 0, and enforces
     * this in the rare case that one argument is slightly negative.
     * The implementation is extremely stable numerically.
     * In particular it guarantees that the result r satisfies
     * MIN(x,y) <= r <= MAX(x,y), and the results are very accurate
     * even when a and b differ greatly in magnitude.
     */
    function interpolate_(a, x, b, y) {
        // from Macro RealInterpolate:
        //(a = (a < 0) ? 0 : a, b = (b < 0) ? 0 : b, ((a <= b) ? ((b == 0) ? ((x+y) / 2) : (x + (y-x) * (a/(a+b)))) : (y + (x-y) * (b/(a+b)))))
        a = (a < 0) ? 0 : a;
        b = (b < 0) ? 0 : b;
        if (a <= b) {
            if (b === 0) {
                return (x + y) / 2;
            }
            else {
                return x + (y - x) * (a / (a + b));
            }
        }
        else {
            return y + (x - y) * (b / (a + b));
        }
    }
    ;
    /**
     * Given edges (o1,d1) and (o2,d2), compute their point of intersection.
     * The computed point is guaranteed to lie in the intersection of the
     * bounding rectangles defined by each edge.
     */
    function edgeIntersect(o1, d1, o2, d2, v) {
        // This is certainly not the most efficient way to find the intersection
        // of two line segments, but it is very numerically stable.
        // Strategy: find the two middle vertices in the VertLeq ordering,
        // and interpolate the intersection s-value from these. Then repeat
        // using the TransLeq ordering to find the intersection t-value.
        var z1;
        var z2;
        var tmp;
        if (!vertLeq(o1, d1)) {
            // Swap(o1, d1);
            tmp = o1;
            o1 = d1;
            d1 = tmp;
        }
        if (!vertLeq(o2, d2)) {
            // Swap(o2, d2);
            tmp = o2;
            o2 = d2;
            d2 = tmp;
        }
        if (!vertLeq(o1, o2)) {
            // Swap(o1, o2);
            tmp = o1;
            o1 = o2;
            o2 = tmp;
            // Swap(d1, d2);
            tmp = d1;
            d1 = d2;
            d2 = tmp;
        }
        if (!vertLeq(o2, d1)) {
            // Technically, no intersection -- do our best
            v.s = (o2.s + d1.s) / 2;
        }
        else if (vertLeq(d1, d2)) {
            // Interpolate between o2 and d1
            z1 = edgeEval(o1, o2, d1);
            z2 = edgeEval(o2, d1, d2);
            if (z1 + z2 < 0) {
                z1 = -z1;
                z2 = -z2;
            }
            v.s = interpolate_(z1, o2.s, z2, d1.s);
        }
        else {
            // Interpolate between o2 and d2
            z1 = edgeSign(o1, o2, d1);
            z2 = -edgeSign(o1, d2, d1);
            if (z1 + z2 < 0) {
                z1 = -z1;
                z2 = -z2;
            }
            v.s = interpolate_(z1, o2.s, z2, d2.s);
        }
        // Now repeat the process for t
        if (!transLeq(o1, d1)) {
            // Swap(o1, d1);
            tmp = o1;
            o1 = d1;
            d1 = tmp;
        }
        if (!transLeq(o2, d2)) {
            // Swap(o2, d2);
            tmp = o2;
            o2 = d2;
            d2 = tmp;
        }
        if (!transLeq(o1, o2)) {
            // Swap(o1, o2);
            tmp = o1;
            o1 = o2;
            o2 = tmp;
            // Swap(d1, d2);
            tmp = d1;
            d1 = d2;
            d2 = tmp;
        }
        if (!transLeq(o2, d1)) {
            // Technically, no intersection -- do our best
            v.t = (o2.t + d1.t) / 2;
        }
        else if (transLeq(d1, d2)) {
            // Interpolate between o2 and d1
            z1 = transEval(o1, o2, d1);
            z2 = transEval(o2, d1, d2);
            if (z1 + z2 < 0) {
                z1 = -z1;
                z2 = -z2;
            }
            v.t = interpolate_(z1, o2.t, z2, d1.t);
        }
        else {
            // Interpolate between o2 and d2
            z1 = transSign(o1, o2, d1);
            z2 = -transSign(o1, d2, d1);
            if (z1 + z2 < 0) {
                z1 = -z1;
                z2 = -z2;
            }
            v.t = interpolate_(z1, o2.t, z2, d2.t);
        }
    }
    exports.edgeIntersect = edgeIntersect;
    ;
});
