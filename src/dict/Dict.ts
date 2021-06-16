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

import { GluTesselator } from "../libtess/GluTesselator"
import { ActiveRegion } from "../sweep/ActiveRegion";
import { DictNode } from "./DictNode";

/**
 * A list of edges crossing the sweep line, sorted from top to bottom.
 * Implementation is a doubly-linked list, sorted by the injected edgeLeq
 * comparator function. Here it is a simple ordering, but see sweep for
 * the list of invariants on the edge dictionary this ordering creates.
 * @constructor
 * @struct
 * @param {!GluTesselator} frame
 * @param {function(!GluTesselator, !ActiveRegion, !ActiveRegion): boolean} leq
 */
export class Dict {
  constructor(frame: GluTesselator, leq: (tess: GluTesselator, r0: ActiveRegion, r1: ActiveRegion) => boolean) {
    this.frame_ = frame;
    this.leq_ = leq; 
  }

  /**
   * The head of the doubly-linked DictNode list. At creation time, links back
   * and forward only to itself.
   */
  private head_ = new DictNode();

  /**
   * The GluTesselator used as the frame for edge/event comparisons.
   * @private {!GluTesselator}
   */
  private frame_: GluTesselator;

  /**
   * Comparison function to maintain the invariants of the Dict. See
   * sweep.edgeLeq_ for source.
   * @private
   * @type {function(!GluTesselator, !ActiveRegion, !ActiveRegion): boolean}
   */
  leq_: (tess: GluTesselator, r0: ActiveRegion, r1: ActiveRegion) => boolean;

  /**
   * Formerly used to delete the dict.
   * NOTE(bckenny): No longer called but left for memFree documentation. Nulled at
   * former callsite instead (sweep.doneEdgeDict_)
   * @private
   */
  deleteDict_(): void {
    // for (var node = this.head_.next; node !== this.head_; node = node.next) {
    //   memFree(node);
    // }
    // memFree(dict);
  };

  /**
   * Insert the supplied key into the edge list and return its new node.
   */
  insertBefore (node: DictNode, key: ActiveRegion): DictNode {
    do {
      node = node.prev;
    } while (node.key !== null && !this.leq_(this.frame_, node.key, key));

    // insert the new node and update the surrounding nodes to point to it
    var newNode = new DictNode(key, node.next, node);
    node.next.prev = newNode;
    node.next = newNode;

    return newNode;
  };

  /**
   * Insert key into the dict and return the new node that contains it.
   */
  insert (key: ActiveRegion): DictNode {
    // NOTE(bckenny): from a macro in dict.h/dict-list.h
    return this.insertBefore(this.head_, key);
  };

  /**
   * Remove node from the list.
   */
  deleteNode (node: DictNode): void {
    node.next.prev = node.prev;
    node.prev.next = node.next;

    // NOTE(bckenny): nulled at callsite (sweep.deleteRegion_)
    // memFree( node );
  };

  /**
   * Search returns the node with the smallest key greater than or equal
   * to the given key. If there is no such key, returns a node whose
   * key is null. Similarly, max(d).getSuccessor() has a null key, etc.
   */
  search (key: ActiveRegion): DictNode {
    var node = this.head_;

    do {
      node = node.next;
    } while (node.key !== null && !this.leq_(this.frame_, key, node.key));

    return node;
  };

  /**
   * Return the node with the smallest key.
   */
  getMin(): DictNode {
    // NOTE(bckenny): from a macro in dict.h/dict-list.h
    return this.head_.next;
  };

  // NOTE(bckenny): Dict.getMax isn't called within libtess and isn't part
  // of the public API. For now, leaving in but ignoring for coverage.

  /**
   * Returns the node with the greatest key.
   */
  getMax(): DictNode {
    // NOTE(bckenny): from a macro in dict.h/dict-list.h
    return this.head_.prev;
  };
};

