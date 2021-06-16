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
define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GluVertex = void 0;
    /**
     * Each vertex has a pointer to next and previous vertices in the
     * circular list, and a pointer to a half-edge with this vertex as
     * the origin (null if this is the dummy header). There is also a
     * field "data" for client data.
     */
    class GluVertex {
        constructor(opt_nextVertex, opt_prevVertex) {
            /**
             * A half-edge with this origin.
             */
            this.anEdge = null;
            /**
             * The client's data.
             */
            this.data = null;
            /**
             * The vertex location in 3D.
             */
            this.coords = [0, 0, 0];
            // TODO(bckenny): we may want to rethink coords, either eliminate (using s
            // and t and user data) or index into contiguous storage?
            /**
             * Component of projection onto the sweep plane.
             */
            this.s = 0;
            /**
             * Component of projection onto the sweep plane.
             */
            this.t = 0;
            /**
             * Handle to allow deletion from priority queue, or 0 if not yet inserted into
             * queue.
             */
            this.pqHandle = 0;
            this.next = opt_nextVertex || this;
            this.prev = opt_prevVertex || this;
        }
    }
    exports.GluVertex = GluVertex;
});
