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

import { Dict } from "../dict/Dict";
import { ErrorType, GluEnum, WindingRule, PrimitiveType, GLU_TESS_MAX_COORD, assert } from "../libtess";
import { GluHalfEdge } from "../mesh/GluHalfEdge";
import { GluMesh } from "../mesh/GluMesh";
import { GluVertex } from "../mesh/GluVertex";
import { PriorityQ } from "../priorityq/PriorityQ";

import * as tessmono from "../tessmono"
import * as render from "../render"
import * as mesh from "../mesh"
import * as normal from "../normal"
import * as sweep from "../sweep"

// TODO(bckenny): create more javascript-y API, e.g. make gluTessEndPolygon
// async, don't require so many temp objects created

/**
 * The begin/end calls must be properly nested. We keep track of the current
 * state to enforce the ordering.
 * @enum {number}
 */
enum TessState {
  T_DORMANT = 0,
  T_IN_POLYGON = 1,
  T_IN_CONTOUR = 2
}

/**
 * The tesselator main class, providing the public API.
 * @constructor
 * @struct
 */
export class GluTesselator {
  // Only initialize fields which can be changed by the api. Other fields
  // are initialized where they are used.

  /**
   * lastEdge_.org is the most recent vertex
   * @private {GluHalfEdge}
   */
  private lastEdge_: GluHalfEdge = null;

  /**
   * stores the input contours, and eventually the tessellation itself
   * @type {GluMesh}
   */
  mesh: GluMesh = null;

  /**
   * Error callback.
   * @private {?function((ErrorType|gluEnum), Object=)}
   */
  private errorCallback_: (error: ErrorType | GluEnum) => void = null;

  /*** state needed for projecting onto the sweep plane ***/

  /**
   * user-specified normal (if provided)
   * @private {!Array<number>}
   */
  private normal_ = [0, 0, 0];

  /*** state needed for the line sweep ***/

  /**
   * rule for determining polygon interior
   */
  windingRule = WindingRule.GLU_TESS_WINDING_ODD;

  /**
   * fatal error: needed combine callback
   */
  fatalError = false;

  /**
   * edge dictionary for sweep line
   */
  dict: Dict = null;
  // NOTE(bckenny): dict initialized in sweep.initEdgeDict_, removed in sweep.doneEdgeDict_

  /**
   * priority queue of vertex events
   */
  pq: PriorityQ = null;
  // NOTE(bckenny): pq initialized in sweep.initPriorityQ

  /**
   * current sweep event being processed
   */
  event: GluVertex = null;

  /**
   * Combine callback.
   * @private {?function(Array<number>, Array<Object>, Array<number>, Object=): Object}
   */
  combineCallback_: (arr: number[], objs: Object[], arr2: number[], obj: Object) => Object = null;

  /*** state needed for rendering callbacks (see render.js) ***/

  /**
   * Extract contours, not triangles
   */
  private boundaryOnly_ = false;

  /**
   * Begin callback.
   * @private {?function(PrimitiveType, Object=)}
   */
  private beginCallback_: (primitiveType: PrimitiveType, obj: Object) => void = null;

  /**
   * Edge flag callback.
   * @private {?function(boolean, Object=)}
   */
  private edgeFlagCallback_: (flag: boolean, obj: Object) => void= null;

  /**
   * Vertex callback.
   * @private {?function(Object, Object=)}
   */
  private vertexCallback_: (obj0: Object, obj1: Object) => void = null;

  /**
   * End callback.
   * @private {?function(Object=)}
   */
  private endCallback_: (obj: Object) => void = null;

  /**
   * Mesh callback.
   * @private {?function(GluMesh)}
   */
  private meshCallback_: (mesh: GluMesh) => void = null;

  /**
   * client data for current polygon
   * @private {Object}
   */
  private polygonData_: Object = null;

  
  /*** state needed for collecting the input data ***/

  /**
   * Tesselator state, tracking what begin/end calls have been seen.
   * @private {GluTesselator.tessState_}
   */
  private state_ = TessState.T_DORMANT;


  /**
   * Destory the tesselator object. See README.
   */
  gluDeleteTess(): void {
    // TODO(bckenny): This does nothing but assert that it isn't called while
    // building the polygon since we rely on GC to handle memory. *If* the public
    // API changes, this should go.
    this.requireState_(TessState.T_DORMANT);
    // memFree(tess); TODO(bckenny)
  }

  /**
   * Set properties for control over tesselation. See README.
   */
  gluTessProperty(which: GluEnum, windingRule: WindingRule) {
    // TODO(bckenny): split into more setters?
    // TODO(bckenny): in any case, we can do better than this switch statement

    switch (which) {
      case GluEnum.GLU_TESS_TOLERANCE:
        // NOTE(bckenny): libtess has never supported any tolerance but 0.
        return;

      case GluEnum.GLU_TESS_WINDING_RULE:
        switch (windingRule) {
          case WindingRule.GLU_TESS_WINDING_ODD:
          case WindingRule.GLU_TESS_WINDING_NONZERO:
          case WindingRule.GLU_TESS_WINDING_POSITIVE:
          case WindingRule.GLU_TESS_WINDING_NEGATIVE:
          case WindingRule.GLU_TESS_WINDING_ABS_GEQ_TWO:
            this.windingRule = windingRule;
            return;
          default:
        }
        break;

      case GluEnum.GLU_TESS_BOUNDARY_ONLY:
        this.boundaryOnly_ = !!windingRule;
        return;

      default:
        this.callErrorCallback(GluEnum.GLU_INVALID_ENUM);
        return;
    }
    this.callErrorCallback(GluEnum.GLU_INVALID_VALUE);
  }

  /**
   * Returns tessellator property
   */
  gluGetTessProperty(which: GluEnum): number {
    // TODO(bckenny): as above, split into more getters? and improve on switch statement
    // why are these being asserted in getter but not setter?
    switch (which) {
      case GluEnum.GLU_TESS_TOLERANCE:
        return 0;

      case GluEnum.GLU_TESS_WINDING_RULE:
        const rule = this.windingRule;

        assert(
          rule === WindingRule.GLU_TESS_WINDING_ODD ||
            rule === WindingRule.GLU_TESS_WINDING_NONZERO ||
            rule === WindingRule.GLU_TESS_WINDING_POSITIVE ||
            rule === WindingRule.GLU_TESS_WINDING_NEGATIVE ||
            rule === WindingRule.GLU_TESS_WINDING_ABS_GEQ_TWO
        );
        return rule;

      case GluEnum.GLU_TESS_BOUNDARY_ONLY:
        assert(this.boundaryOnly_ === true || this.boundaryOnly_ === false);
        return this.boundaryOnly_ ? 0 : 1;

      default:
        this.callErrorCallback(GluEnum.GLU_INVALID_ENUM);
        break;
    }

    return 0;
  }

  /**
   * Lets the user supply the polygon normal, if known. All input data is
   * projected into a plane perpendicular to the normal before tesselation. All
   * output triangles are oriented CCW with respect to the normal (CW orientation
   * can be obtained by reversing the sign of the supplied normal). For example,
   * if you know that all polygons lie in the x-y plane, call
   * `tess.gluTessNormal(0.0, 0.0, 1.0)` before rendering any polygons.
   */
  gluTessNormal(x: number, y: number, z: number): void {
    this.normal_[0] = x;
    this.normal_[1] = y;
    this.normal_[2] = z;
  }

  /**
   * Specify callbacks. See README for callback descriptions. A null or undefined
   * opt_fn removes current callback.
   * @param {GluEnum} which The callback-type GluEnum value.
   * @param {?Function=} opt_fn
   */
  gluTessCallback(which: GluEnum, opt_fn?: Function): void {
    const fn = !opt_fn ? null : opt_fn;
    // TODO(bckenny): better opt_fn typing?
    // TODO(bckenny): should add documentation that references in callback are volatile (or make a copy)

    switch (which) {
      case GluEnum.GLU_TESS_BEGIN:
      case GluEnum.GLU_TESS_BEGIN_DATA:
        this.beginCallback_ = /** @type {?function(PrimitiveType, Object=)} */ fn  as any;
        return;

      case GluEnum.GLU_TESS_EDGE_FLAG:
      case GluEnum.GLU_TESS_EDGE_FLAG_DATA:
        this.edgeFlagCallback_ = /** @type {?function(boolean, Object=)} */ fn  as any;
        return;

      case GluEnum.GLU_TESS_VERTEX:
      case GluEnum.GLU_TESS_VERTEX_DATA:
        this.vertexCallback_ = /** @type {?function(Object, Object=)} */ fn  as any;
        return;

      case GluEnum.GLU_TESS_END:
      case GluEnum.GLU_TESS_END_DATA:
        this.endCallback_ = /** @type {?function(Object=)} */ fn  as any;
        return;

      case GluEnum.GLU_TESS_ERROR:
      case GluEnum.GLU_TESS_ERROR_DATA:
        this.errorCallback_ = /** @type {?function((ErrorType|GluEnum), Object=)} */ fn as any;
        return;

      case GluEnum.GLU_TESS_COMBINE:
      case GluEnum.GLU_TESS_COMBINE_DATA:
        this.combineCallback_ =
          /** @type {?function(Array<number>, Array<Object>, Array<number>, Object=): Object} */ fn as any;
        return;

      case GluEnum.GLU_TESS_MESH:
        this.meshCallback_ = /** @type {?function(GluMesh)} */ fn  as any;
        return;

      default:
        this.callErrorCallback(GluEnum.GLU_INVALID_ENUM);
        return;
    }
  }

  /**
   * Specify a vertex and associated data. Must be within calls to
   * beginContour/endContour. See README.
   */
  gluTessVertex(coords: number[], data: Object): void {
    let tooLarge = false;

    // TODO(bckenny): pool allocation?
    const clamped = [0, 0, 0];

    this.requireState_(TessState.T_IN_CONTOUR);

    for (let i = 0; i < 3; ++i) {
      let x = coords[i];
      if (x < -GLU_TESS_MAX_COORD) {
        x = -GLU_TESS_MAX_COORD;
        tooLarge = true;
      }
      if (x > GLU_TESS_MAX_COORD) {
        x = GLU_TESS_MAX_COORD;
        tooLarge = true;
      }
      clamped[i] = x;
    }

    if (tooLarge) {
      this.callErrorCallback(ErrorType.GLU_TESS_COORD_TOO_LARGE);
    }

    this.addVertex_(clamped, data);
  }

  /**
   * [gluTessBeginPolygon description]
   * @param {Object} data Client data for current polygon.
   */
  gluTessBeginPolygon(data: Object): void {
    this.requireState_(TessState.T_DORMANT);

    this.state_ = TessState.T_IN_POLYGON;

    this.mesh = new GluMesh();

    this.polygonData_ = data;
  }

  /**
   * [gluTessBeginContour description]
   */
  gluTessBeginContour(): void {
    this.requireState_(TessState.T_IN_POLYGON);

    this.state_ = TessState.T_IN_CONTOUR;
    this.lastEdge_ = null;
  }

  /**
   * [gluTessEndContour description]
   */
  gluTessEndContour(): void {
    this.requireState_(TessState.T_IN_CONTOUR);
    this.state_ = TessState.T_IN_POLYGON;
  }

  /**
   * [gluTessEndPolygon description]
   */
  gluTessEndPolygon(): void {
    this.requireState_(TessState.T_IN_POLYGON);
    this.state_ = TessState.T_DORMANT;

    // Determine the polygon normal and project vertices onto the plane
    // of the polygon.
    normal.projectPolygon(this, this.normal_[0], this.normal_[1], this.normal_[2]);

    // computeInterior(tess) computes the planar arrangement specified
    // by the given contours, and further subdivides this arrangement
    // into regions. Each region is marked "inside" if it belongs
    // to the polygon, according to the rule given by this.WindingRule.
    // Each interior region is guaranteed be monotone.
    sweep.computeInterior(this);

    if (!this.fatalError) {
      // If the user wants only the boundary contours, we throw away all edges
      // except those which separate the interior from the exterior.
      // Otherwise we tessellate all the regions marked "inside".
      // NOTE(bckenny): we know this.mesh has been initialized, so help closure out.
      if (this.boundaryOnly_) {
        tessmono.setWindingNumber(this.mesh, 1, true);
      } else {
        tessmono.tessellateInterior(this.mesh);
      }

      this.mesh.checkMesh();

      if (this.beginCallback_ || this.endCallback_ || this.vertexCallback_ || this.edgeFlagCallback_) {
        if (this.boundaryOnly_) {
          // output boundary contours
          render.renderBoundary(this, this.mesh);
        } else {
          // output triangles (with edge callback if one is set)
          const flagEdges = !!this.edgeFlagCallback_;
          render.renderMesh(this, this.mesh, flagEdges);
        }
      }

      if (this.meshCallback_) {
        // Throw away the exterior faces, so that all faces are interior.
        // This way the user doesn't have to check the "inside" flag,
        // and we don't need to even reveal its existence. It also leaves
        // the freedom for an implementation to not generate the exterior
        // faces in the first place.
        tessmono.discardExterior(this.mesh);
        // user wants the mesh itself
        this.meshCallback_(this.mesh);

        this.mesh = null;
        this.polygonData_ = null;
        return;
      }
    }

    mesh.deleteMesh(this.mesh);
    
    this.polygonData_ = null;
    this.mesh = null;
  }

  /**
   * Change the tesselator state.
   * @private
   * @param {TessState} state
   */
  requireState_(state: TessState): void {
    if (this.state_ !== state) {
      this.gotoState_(state);
    }
  }

  /**
   * Change the current tesselator state one level at a time to get to the
   * desired state. Only triggered when the API is not called in the correct order
   * so an error callback is made, however the tesselator will always attempt to
   * recover afterwards (see README).
   * @private
   * @param {tessState_} newState
   */
  gotoState_(newState: TessState): void {
    while (this.state_ !== newState) {
      if (this.state_ < newState) {
        switch (this.state_) {
          case TessState.T_DORMANT:
            this.callErrorCallback(ErrorType.GLU_TESS_MISSING_BEGIN_POLYGON);
            this.gluTessBeginPolygon(null);
            break;

          case TessState.T_IN_POLYGON:
            this.callErrorCallback(ErrorType.GLU_TESS_MISSING_BEGIN_CONTOUR);
            this.gluTessBeginContour();
            break;
        }
      } else {
        switch (this.state_) {
          case TessState.T_IN_CONTOUR:
            this.callErrorCallback(ErrorType.GLU_TESS_MISSING_END_CONTOUR);
            this.gluTessEndContour();
            break;

          case TessState.T_IN_POLYGON:
            this.callErrorCallback(ErrorType.GLU_TESS_MISSING_END_POLYGON);
            // NOTE(bckenny): libtess originally reset the tesselator, even though
            // the README claims it should spit out the tessellated results at
            // this point.
            // (see http://cgit.freedesktop.org/mesa/glu/tree/src/libtess/tess.c#n180)
            this.gluTessEndPolygon();
            break;
        }
      }
    }
  }

  /**
   * [addVertex_ description]
   * @private
   * @param {!Array<number>} coords [description].
   * @param {Object} data [description].
   */
  addVertex_(coords: number[], data: Object): void {
    let e = this.lastEdge_;
    if (e === null) {
      // Make a self-loop (one vertex, one edge).
      e = mesh.makeEdge(this.mesh);
      mesh.meshSplice(e, e.sym);
    } else {
      // Create a new vertex and edge which immediately follow e
      // in the ordering around the left face.
      mesh.splitEdge(e);
      e = e.lNext;
    }

    // The new vertex is now e.org.
    e.org.data = data;
    e.org.coords[0] = coords[0];
    e.org.coords[1] = coords[1];
    e.org.coords[2] = coords[2];

    // The winding of an edge says how the winding number changes as we
    // cross from the edge''s right face to its left face.  We add the
    // vertices in such an order that a CCW contour will add +1 to
    // the winding number of the region inside the contour.
    e.winding = 1;
    e.sym.winding = -1;

    this.lastEdge_ = e;
  }

  /**
   * Call callback to indicate the start of a primitive, to be followed by emitted
   * vertices, if any. In js, `type` will always be `GL_TRIANGLES`.
   * @param {PrimitiveType} type
   */
  callBeginCallback(type: PrimitiveType): void {
    if (this.beginCallback_) {
      this.beginCallback_(type, this.polygonData_);
    }
  }

  /**
   * Call callback to emit a vertex of the tessellated polygon.
   * @param {Object} data
   */
  callVertexCallback(data: Object): void {
    if (this.vertexCallback_) {
      this.vertexCallback_(data, this.polygonData_);
    }
  }

  /**
   * Call callback to indicate whether the vertices to follow begin edges which
   * lie on a polygon boundary.
   * @param {boolean} flag
   */
  callEdgeFlagCallback(flag: boolean): void {
    if (this.edgeFlagCallback_) {
      this.edgeFlagCallback_(flag, this.polygonData_);
    }
  }

  /**
   * Call callback to indicate the end of tessellation.
   */
  callEndCallback(): void {
    if (this.endCallback_) {
      this.endCallback_(this.polygonData_);
    }
  }

  /* jscs:disable maximumLineLength */
  /**
   * Call callback for combining vertices at edge intersection requiring the
   * creation of a new vertex.
   * @param {!Array<number>} coords Intersection coordinates.
   * @param {!Array<Object>} data Array of vertex data, one per edge vertices.
   * @param {!Array<number>} weight Coefficients used for the linear combination of vertex coordinates that gives coords.
   * @return {?Object} Interpolated vertex.
   */
  callCombineCallback(coords: number[], data: Object[], weight: number[]): Object {
    if (this.combineCallback_) {
      return this.combineCallback_(coords, data, weight, this.polygonData_) || null;
    }

    return null;
  }
  /* jscs:enable maximumLineLength */

  /**
   * Call error callback, if specified, with errno.
   * @param {(ErrorType|GluEnum)} errno
   */
  callErrorCallback(errno: ErrorType | GluEnum): void {
    if (this.errorCallback_) {
      this.errorCallback_(errno);
    }
  }
}
