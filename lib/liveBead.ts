import * as THREE from 'three';

/**
 * Construction INCRÉMENTALE du cordon déposé.
 *
 * L'ancienne version reconstruisait toute la géométrie à chaque rafraîchissement :
 * coût O(n) qui grandit avec la pièce, donc fluide au début et saccadé à la fin.
 *
 * Ici toute la mémoire est réservée une seule fois. Ajouter un point n'écrit
 * que son anneau de sommets et déplace la plage d'affichage : coût constant,
 * quelle que soit la taille de la pièce.
 *
 * Rupture entre deux cordons : on écrit un anneau de rayon nul de chaque côté.
 * Les triangles reliant deux anneaux dégénérés ont une aire nulle, donc ils ne
 * sont jamais rasterisés — la liaison est invisible sans géométrie séparée.
 */
export class LiveBeadBuilder {
  readonly geometry = new THREE.BufferGeometry();

  private rs: number;
  private capacity: number;
  private pos: Float32Array;
  private nor: Float32Array;
  private col: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private norAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;

  private count = 0;
  private overflowed = false;
  // Zone modifiée depuis le dernier envoi GPU, accumulée sur toute l'image.
  private dirtyFrom = Infinity;
  private dirtyTo = -Infinity;
  private last = new THREE.Vector3();
  private hasLast = false;
  private tangent = new THREE.Vector3(1, 0, 0);

  private readonly _side = new THREE.Vector3();
  private readonly _up = new THREE.Vector3();
  private readonly _worldUp = new THREE.Vector3(0, 1, 0);
  private readonly _t = new THREE.Vector3();

  constructor(capacity = 60000, radialSegments = 6) {
    this.capacity = capacity;
    this.rs = radialSegments;

    const verts = capacity * radialSegments;
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);

    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.norAttr = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('normal', this.norAttr);
    this.geometry.setAttribute('color', this.colAttr);

    // La connectivité ne dépend pas des données : index rempli une fois pour
    // toutes, on ne joue ensuite que sur la plage d'affichage.
    const idx = new Uint32Array(Math.max(0, capacity - 1) * radialSegments * 6);
    let k = 0;
    for (let i = 0; i < capacity - 1; i++) {
      const base = i * radialSegments;
      const next = (i + 1) * radialSegments;
      for (let j = 0; j < radialSegments; j++) {
        const jn = (j + 1) % radialSegments;
        idx[k++] = base + j;  idx[k++] = base + jn; idx[k++] = next + j;
        idx[k++] = base + jn; idx[k++] = next + jn; idx[k++] = next + j;
      }
    }
    this.geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geometry.setDrawRange(0, 0);
    // Sphère large : évite que le frustum culling fasse disparaître la pièce
    // pendant qu'elle grandit (on ne recalcule pas les bornes à chaque point).
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);
  }

  reset() {
    this.count = 0;
    this.hasLast = false;
    this.overflowed = false;
    this.dirtyFrom = Infinity;
    this.dirtyTo = -Infinity;
    this.geometry.setDrawRange(0, 0);
  }

  get pointCount() { return this.count; }
  get isFull() { return this.overflowed; }
  get lastPoint() { return this.last; }
  get started() { return this.hasLast; }

  /**
   * Ajoute un anneau.
   * @param radiusScale 0 pour ouvrir/fermer un cordon (anneau dégénéré, invisible).
   */
  append(
    p: THREE.Vector3,
    color: THREE.Color,
    halfWidth: number,
    halfHeight: number,
    radiusScale = 1,
  ) {
    if (this.count >= this.capacity) { this.overflowed = true; return; }

    if (this.hasLast) {
      this._t.subVectors(p, this.last);
      if (this._t.lengthSq() > 1e-16) this.tangent.copy(this._t).normalize();
    }

    this._side.crossVectors(this.tangent, this._worldUp);
    if (this._side.lengthSq() < 1e-10) this._side.set(1, 0, 0);
    this._side.normalize();
    this._up.crossVectors(this._side, this.tangent).normalize();

    const hw = halfWidth * radiusScale;
    const hh = halfHeight * radiusScale;
    const aw = halfWidth || 1e-6;
    const ah = halfHeight || 1e-6;
    const base = this.count * this.rs;

    for (let j = 0; j < this.rs; j++) {
      const th = (j / this.rs) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const o = (base + j) * 3;

      this.pos[o]     = p.x + this._side.x * c * hw + this._up.x * s * hh;
      this.pos[o + 1] = p.y + this._side.y * c * hw + this._up.y * s * hh;
      this.pos[o + 2] = p.z + this._side.z * c * hw + this._up.z * s * hh;

      let nx = this._side.x * (c / aw) + this._up.x * (s / ah);
      let ny = this._side.y * (c / aw) + this._up.y * (s / ah);
      let nz = this._side.z * (c / aw) + this._up.z * (s / ah);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      this.nor[o] = nx / len; this.nor[o + 1] = ny / len; this.nor[o + 2] = nz / len;

      this.col[o] = color.r; this.col[o + 1] = color.g; this.col[o + 2] = color.b;
    }

    this.last.copy(p);
    this.hasLast = true;
    this.count++;

    const from = base * 3;
    const to = (this.count * this.rs) * 3;
    if (from < this.dirtyFrom) this.dirtyFrom = from;
    if (to > this.dirtyTo) this.dirtyTo = to;

    this.geometry.setDrawRange(0, Math.max(0, this.count - 1) * this.rs * 6);
  }

  /**
   * Envoie au GPU les anneaux écrits depuis le dernier appel.
   *
   * À appeler UNE FOIS par image, après avoir ajouté tous les points reçus.
   * Appeler l'équivalent à chaque point écrasait les zones précédentes
   * (addUpdateRange accumule, clearUpdateRanges efface tout) : seuls les
   * sommets du dernier point étaient transmis, les autres restaient à zéro
   * et produisaient des triangles partant de l'origine.
   */
  flush() {
    if (this.dirtyTo <= this.dirtyFrom) return;
    const from = this.dirtyFrom;
    const count = this.dirtyTo - from;
    for (const attr of [this.posAttr, this.norAttr, this.colAttr] as any[]) {
      if (typeof attr.clearUpdateRanges === 'function') {
        attr.clearUpdateRanges();
        attr.addUpdateRange(from, count);
      } else if (attr.updateRange) {
        attr.updateRange.offset = from;
        attr.updateRange.count = count;
      }
      attr.needsUpdate = true;
    }
    this.dirtyFrom = Infinity;
    this.dirtyTo = -Infinity;
  }

  /** Fixe la tangente sans écrire d'anneau — évite un anneau mal orienté en début de cordon. */
  primeTangent(a: THREE.Vector3, b: THREE.Vector3) {
    this._t.subVectors(b, a);
    if (this._t.lengthSq() > 1e-16) this.tangent.copy(this._t).normalize();
  }

  dispose() { this.geometry.dispose(); }
}