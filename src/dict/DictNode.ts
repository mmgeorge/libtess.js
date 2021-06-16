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

import { ActiveRegion } from "../sweep/ActiveRegion";

/**
 * A doubly-linked-list node with a libtess.ActiveRegion payload.
 * The key for this node and the next and previous nodes in the parent Dict list
 * can be provided to insert it into an existing list (or all can be omitted if
 * this is to be the founding node of the list).
 */
export class DictNode {
  constructor(opt_key?: ActiveRegion, opt_nextNode?: DictNode, opt_prevNode?: DictNode) {
    this.key = opt_key || null;
    this.next = opt_nextNode || this;
    this.prev = opt_prevNode || this;
  }

  /**
   * The ActiveRegion key for this node, or null if the head of the list.
   */
  key: ActiveRegion

  /**
   * Link to next DictNode in parent list or to self if this is the first node.
   */
  next: DictNode

  /**
   * Link to previous DictNode in parent list or to self if this is the first node.
   */
  prev: DictNode;

  
  /**
   * Get the key from this node.
   */
  getKey(): ActiveRegion {
    return this.key;
  };

  /**
   * Get the successor node to this one.
   */
  getSuccessor(): DictNode {
    return this.next;
  };

  /**
   * Get the predecessor node to this one.
   */
  getPredecessor(): DictNode {
    return this.prev;
  };

};
