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
define(["require", "exports", "tslib", "../libtess", "../geom"], function (require, exports, tslib_1, libtess_1, geom) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PriorityQHeap = void 0;
    geom = tslib_1.__importStar(geom);
    /**
     * A priority queue of vertices, ordered by geom.vertLeq, implemented
     * with a binary heap. Used only within PriorityQ for prioritizing
     * vertices created by intersections (see sweep.checkForIntersect_).
     */
    class PriorityQHeap {
        constructor() {
            /**
             * An unordered list of vertices in the heap, with null in empty slots.
             */
            this.verts_ = [null, null];
            /**
             * An unordered list of indices mapping vertex handles into the heap. An entry
             * at index i will map the vertex at i in verts_ to its place in the heap
             * (i.e. heap_[handles_[i]] === i).
             * Empty slots below size_ are a free list chain starting at freeList_.
             */
            this.handles_ = [0, 0];
            /**
             * The size of the queue.
             */
            this.size_ = 0;
            /**
             * The queue's current allocated space.
             */
            this.max_ = PriorityQHeap.INIT_SIZE_;
            /**
             * The index of the next free hole in the verts_ array. That slot in handles_
             * has the next index in the free list. If there are no holes, freeList_ === 0
             * and a new vertex must be appended to the list.
             * @private {PQHandle}
             */
            this.freeList_ = 0;
            /**
             * Indicates that the heap has been initialized via init. If false, inserts
             * are fast insertions at the end of a list. If true, all inserts will now be
             * correctly ordered in the queue before returning.
             * @private {boolean}
             */
            this.initialized_ = false;
            this.heap_ = this.reallocNumeric_([0], PriorityQHeap.INIT_SIZE_ + 1);
            // Point the first index at the first (currently null) vertex.
            this.heap_[1] = 1;
        }
        /**
         * Allocate a numeric index array of size size. oldArray's contents are copied
         * to the beginning of the new array. The rest of the array is filled with
         * zeroes.
         */
        reallocNumeric_(oldArray, size) {
            var newArray = new Array(size);
            // NOTE(bckenny): V8 likes this significantly more than simply growing the
            // array element-by-element or expanding the existing array all at once, so,
            // for now, emulating realloc.
            for (var index = 0; index < oldArray.length; index++) {
                newArray[index] = oldArray[index];
            }
            for (; index < size; index++) {
                newArray[index] = 0;
            }
            return newArray;
        }
        ;
        /**
         * Initializing ordering of the heap. Must be called before any method other
         * than insert is called to ensure correctness when removing or querying.
         */
        init() {
            // This method of building a heap is O(n), rather than O(n lg n).
            for (var i = this.size_; i >= 1; --i) {
                // TODO(bckenny): since init is called before anything is inserted (see
                // PriorityQ.init), this will always be empty. Better to lazily init?
                this.floatDown_(i);
            }
            this.initialized_ = true;
        }
        ;
        /**
         * Insert a new vertex into the heap.
         * @param {GluVertex} vert The vertex to insert.
         * @return {PQHandle} A handle that can be used to remove the vertex.
         */
        insert(vert) {
            var endIndex = ++this.size_;
            // If the heap overflows, double its size.
            if ((endIndex * 2) > this.max_) {
                this.max_ *= 2;
                this.handles_ = this.reallocNumeric_(this.handles_, this.max_ + 1);
            }
            var newVertSlot;
            if (this.freeList_ === 0) {
                // No free slots, append vertex.
                newVertSlot = endIndex;
            }
            else {
                // Put vertex in free slot, update freeList_ to next free slot.
                newVertSlot = this.freeList_;
                this.freeList_ = this.handles_[this.freeList_];
            }
            this.verts_[newVertSlot] = vert;
            this.handles_[newVertSlot] = endIndex;
            this.heap_[endIndex] = newVertSlot;
            if (this.initialized_) {
                this.floatUp_(endIndex);
            }
            return newVertSlot;
        }
        ;
        /**
         * @return {boolean} Whether the heap is empty.
         */
        isEmpty() {
            return this.size_ === 0;
        }
        ;
        /**
         * Returns the minimum vertex in the heap. If the heap is empty, null will be
         * returned.
         */
        minimum() {
            return this.verts_[this.heap_[1]];
        }
        ;
        /**
         * Removes the minimum vertex from the heap and returns it. If the heap is
         * empty, null will be returned.
         */
        extractMin() {
            var heap = this.heap_;
            var verts = this.verts_;
            var handles = this.handles_;
            var minHandle = heap[1];
            var minVertex = verts[minHandle];
            if (this.size_ > 0) {
                // Replace min with last vertex.
                heap[1] = heap[this.size_];
                handles[heap[1]] = 1;
                // Clear min vertex and put slot at front of freeList_.
                verts[minHandle] = null;
                handles[minHandle] = this.freeList_;
                this.freeList_ = minHandle;
                // Restore heap.
                if (--this.size_ > 0) {
                    this.floatDown_(1);
                }
            }
            return minVertex;
        }
        ;
        /**
         * Remove vertex with handle removeHandle from heap.
         * @param {PQHandle} removeHandle
         */
        remove(removeHandle) {
            var heap = this.heap_;
            var verts = this.verts_;
            var handles = this.handles_;
            libtess_1.assert(removeHandle >= 1 && removeHandle <= this.max_ &&
                verts[removeHandle] !== null);
            var heapIndex = handles[removeHandle];
            // Replace with last vertex.
            heap[heapIndex] = heap[this.size_];
            handles[heap[heapIndex]] = heapIndex;
            // Restore heap.
            if (heapIndex <= --this.size_) {
                if (heapIndex <= 1) {
                    this.floatDown_(heapIndex);
                }
                else {
                    var vert = verts[heap[heapIndex]];
                    var parentVert = verts[heap[heapIndex >> 1]];
                    if (geom.vertLeq(parentVert, vert)) {
                        this.floatDown_(heapIndex);
                    }
                    else {
                        this.floatUp_(heapIndex);
                    }
                }
            }
            // Clear vertex and put slot at front of freeList_.
            verts[removeHandle] = null;
            handles[removeHandle] = this.freeList_;
            this.freeList_ = removeHandle;
        }
        ;
        /**
         * Restore heap by moving the vertex at index in the heap downwards to a valid
         * slot.
         * @private
         */
        floatDown_(index) {
            var heap = this.heap_;
            var verts = this.verts_;
            var handles = this.handles_;
            var currIndex = index;
            var currHandle = heap[currIndex];
            for (;;) {
                // The children of node i are nodes 2i and 2i+1.
                var childIndex = currIndex << 1;
                if (childIndex < this.size_) {
                    // Set child to the index of the child with the minimum vertex.
                    if (geom.vertLeq(verts[heap[childIndex + 1]], verts[heap[childIndex]])) {
                        childIndex = childIndex + 1;
                    }
                }
                libtess_1.assert(childIndex <= this.max_);
                var childHandle = heap[childIndex];
                if (childIndex > this.size_ ||
                    geom.vertLeq(verts[currHandle], verts[childHandle])) {
                    // Heap restored.
                    heap[currIndex] = currHandle;
                    handles[currHandle] = currIndex;
                    return;
                }
                // Swap current node and child; repeat from childIndex.
                heap[currIndex] = childHandle;
                handles[childHandle] = currIndex;
                currIndex = childIndex;
            }
        }
        ;
        /**
         * Restore heap by moving the vertex at index in the heap upwards to a valid
         * slot.
         */
        floatUp_(index) {
            var heap = this.heap_;
            var verts = this.verts_;
            var handles = this.handles_;
            var currIndex = index;
            var currHandle = heap[currIndex];
            for (;;) {
                // The parent of node i is node floor(i/2).
                var parentIndex = currIndex >> 1;
                var parentHandle = heap[parentIndex];
                if (parentIndex === 0 ||
                    geom.vertLeq(verts[parentHandle], verts[currHandle])) {
                    // Heap restored.
                    heap[currIndex] = currHandle;
                    handles[currHandle] = currIndex;
                    return;
                }
                // Swap current node and parent; repeat from parentIndex.
                heap[currIndex] = parentHandle;
                handles[parentHandle] = currIndex;
                currIndex = parentIndex;
            }
        }
        ;
    }
    exports.PriorityQHeap = PriorityQHeap;
    // The initial allocated space for the queue.
    PriorityQHeap.INIT_SIZE_ = 32;
    ;
});
