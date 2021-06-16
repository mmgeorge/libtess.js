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
define(["require", "exports", "./libtess"], function (require, exports, libtess_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.renderBoundary = exports.renderMesh = void 0;
    /**
     * Takes a mesh, breaks it into separate triangles, and renders them. The
     * rendering output is provided as callbacks (see the API). Set flagEdges to
     * true to get edgeFlag callbacks (tess.flagBoundary in original libtess).
     */
    function renderMesh(tess, mesh, flagEdges) {
        var beginCallbackCalled = false;
        // TODO(bckenny): edgeState needs to be boolean, but !== on first call
        // force edge state output for first vertex
        var edgeState = -1;
        // We examine all faces in an arbitrary order. Whenever we find
        // an inside triangle f, we render f.
        // NOTE(bckenny): go backwards through face list to match original libtess
        // triangle order
        for (var f = mesh.fHead.prev; f !== mesh.fHead; f = f.prev) {
            if (f.inside) {
                // We're going to emit a triangle, so call begin callback once
                if (!beginCallbackCalled) {
                    tess.callBeginCallback(libtess_1.PrimitiveType.GL_TRIANGLES);
                    beginCallbackCalled = true;
                }
                // check that face has only three edges
                var e = f.anEdge;
                libtess_1.assert(e.lNext.lNext.lNext === e, 'renderMesh called with non-triangulated mesh');
                // Loop once for each edge (there will always be 3 edges)
                do {
                    if (flagEdges) {
                        // Set the "edge state" to true just before we output the
                        // first vertex of each edge on the polygon boundary.
                        var newState = !e.rFace().inside ? 1 : 0; // TODO(bckenny): total hack to get edgeState working. fix me.
                        if (edgeState !== newState) {
                            edgeState = newState;
                            // TODO(bckenny): edgeState should be boolean now
                            tess.callEdgeFlagCallback(!!edgeState);
                        }
                    }
                    // emit vertex
                    tess.callVertexCallback(e.org.data);
                    e = e.lNext;
                } while (e !== f.anEdge);
            }
        }
        // only call end callback if begin was called
        if (beginCallbackCalled) {
            tess.callEndCallback();
        }
    }
    exports.renderMesh = renderMesh;
    ;
    /**
     * Takes a mesh, and outputs one contour for each face marked "inside". The
     * rendering output is provided as callbacks (see the API).
     */
    function renderBoundary(tess, mesh) {
        for (var f = mesh.fHead.next; f !== mesh.fHead; f = f.next) {
            if (f.inside) {
                tess.callBeginCallback(libtess_1.PrimitiveType.GL_LINE_LOOP);
                var e = f.anEdge;
                do {
                    tess.callVertexCallback(e.org.data);
                    e = e.lNext;
                } while (e !== f.anEdge);
                tess.callEndCallback();
            }
        }
    }
    exports.renderBoundary = renderBoundary;
    ;
});
