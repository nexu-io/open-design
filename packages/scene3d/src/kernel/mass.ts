import { Rational, rat } from "./rational.js";
import type { KernelMesh, RVec3 } from "./mesh.js";

/**
 * Exact mass properties of a closed mesh — the physics certificate.
 *
 * A game asset is not finished when its surface is right; a physics engine
 * wants its VOLUME, its CENTRE OF MASS, and its INERTIA TENSOR, and those are
 * usually shipped as float approximations nobody can check. Here they are
 * DERIVED, exactly, over ℚ: the whole computation is rational determinants and
 * sums with no square root and no trig anywhere, so a mesh authored at rational
 * coordinates has an exactly-rational volume, centroid and inertia tensor —
 * the same bytes on every machine, and a value the compiler can adjudicate an
 * author's `claims:` against the way it adjudicates the census.
 *
 * The method is the classic tetrahedron decomposition (Tonon 2004; the
 * barycentric second-moment integral ∫λ_kλ_l dV = V·(1+δ_kl)/20): each triangle
 * of the (fan-triangulated) surface forms a signed tetrahedron with the origin,
 * and the divergence theorem turns the solid integrals into a sum over those
 * tetrahedra. The signs make the sum independent of where the origin sits and
 * cancel any inward-wound orientation (a globally inward mesh just flips every
 * term, which we detect from the total signed volume and undo).
 *
 * The principal moments of inertia are the eigenvalues of the centroidal
 * tensor — generally irrational, so they are NOT forced into ℚ. Instead the
 * exact characteristic cubic is reported, and the one qualitative fact that IS
 * decidable over ℚ — whether two principal moments coincide, i.e. the asset has
 * an axis of rotational mass symmetry — is read off the cubic's DISCRIMINANT
 * being zero. Symmetry from the mass tensor, without ever leaving the rationals.
 */

/** A 3×3 matrix of exact rationals, row-major. */
export type RMat3 = [RVec3, RVec3, RVec3];

export interface MassProperties {
  /** Exact volume (unit density: mass == volume). Always > 0 for a closed,
   *  consistently wound mesh; the sign of the raw integral is normalised out. */
  volume: Rational;
  /** Exact centre of mass. */
  centroid: RVec3;
  /** Inertia tensor about the CENTROID, unit density — exact, symmetric. Scale
   *  by a density ρ for a real mass tensor; the tensor is linear in ρ. */
  inertia: RMat3;
  /** The centroidal tensor's characteristic polynomial λ³ + Aλ² + Bλ + C as
   *  exact coefficients [A, B, C]. Its three real roots are the principal
   *  moments of inertia (generally irrational, hence left as the cubic). */
  charPoly: [Rational, Rational, Rational];
  /** Exact discriminant of {@link charPoly}. Zero ⟺ a repeated principal
   *  moment. Reported so a consumer can see WHY symmetryAxis is what it is. */
  discriminant: Rational;
  /** True ⟺ two or more principal moments coincide (discriminant 0): the asset
   *  has an axis of rotational mass symmetry (or, if all three coincide, is a
   *  spherical top). Decided exactly over ℚ, no eigenvalue ever formed. */
  symmetryAxis: boolean;
  /** A heuristic scale for how far the volume can move across triangulations of
   *  the mesh's non-planar faces: Σ over each face's v0-fan diagonals of the
   *  |corner-tetrahedron|. EXACT for a quad (its one diagonal is the only choice,
   *  and the two triangulations differ by exactly that corner tet), so it is the
   *  reported band `volume ± volumeAmbiguity` for the common non-planar case. It
   *  is NOT a planarity certificate: it walks only the v0-fan, so collinear
   *  vertices on those diagonals can zero it for a genuinely non-planar ≥5-gon —
   *  use {@link allFacesPlanar} to decide triangulation-independence, never this.
   *  A valid lower bound on the twist, and the exact band for quads. */
  volumeAmbiguity: Rational;
  /** True ⟺ EVERY face is exactly planar (its Newell normal is nonzero and every
   *  vertex lies in that plane), decided over ℚ. This is the certificate that the
   *  signed volume is triangulation-INDEPENDENT: a planar polygon's divergence
   *  flux is the same for every triangulation, a non-planar one's is not. A face
   *  whose Newell normal is zero (a fully-collinear, zero-area ring) is NOT
   *  certified — conservative, and such a face is a degenerate shipped triangle
   *  the embedding test already reports. The gate the volume claim must use. */
  allFacesPlanar: boolean;
  /** Conditioning of the volume sum, Σ|origin-tet det|/6 — the exact scale for
   *  the float forward-error bound `K·ε·conditioning` within which a
   *  Blender-measured fan volume must reproduce this exact value. */
  conditioning: Rational;
}

const dot = (a: RVec3, b: RVec3): Rational => a[0].mul(b[0]).add(a[1].mul(b[1])).add(a[2].mul(b[2]));
const cross = (a: RVec3, b: RVec3): RVec3 => [
  a[1].mul(b[2]).sub(a[2].mul(b[1])),
  a[2].mul(b[0]).sub(a[0].mul(b[2])),
  a[0].mul(b[1]).sub(a[1].mul(b[0])),
];
const sub3 = (a: RVec3, b: RVec3): RVec3 => [a[0].sub(b[0]), a[1].sub(b[1]), a[2].sub(b[2])];
const absR = (x: Rational): Rational => (x.cmp(Rational.ZERO) < 0 ? x.neg() : x);

/**
 * Compute exact mass properties for a closed mesh under uniform unit density.
 *
 * Returns null when the mesh encloses no volume (an open or degenerate mesh),
 * because a centroid and an inertia tensor are meaningless there — the caller
 * (which knows watertightness from the census) decides whether that is a fault
 * or simply "not applicable".
 */
export function massProperties(mesh: KernelMesh): MassProperties | null {
  const V = mesh.verts;
  // Accumulators, all SIGNED (the winding sign is normalised out at the end):
  //   sixVol  = Σ det[a,b,c]           = 6·(signed volume)
  //   m1[i]   = Σ det·(a+b+c)[i]        = 24·(signed first moment)
  //   c120[i][j] = Σ det·(S_i S_j + Q_ij) = 120·(signed covariance)  (S=a+b+c)
  let sixVol = Rational.ZERO;
  let condSum6 = Rational.ZERO; // Σ|origin-tet det| — conditioning of the volume sum
  let ambig6 = Rational.ZERO; // Σ over fan diagonals of |corner-tet det| — the twist bound
  let allFacesPlanar = true; // exact: cleared by the first non-planar (or degenerate) face
  const m1: [Rational, Rational, Rational] = [Rational.ZERO, Rational.ZERO, Rational.ZERO];
  const c120: RMat3 = [
    [Rational.ZERO, Rational.ZERO, Rational.ZERO],
    [Rational.ZERO, Rational.ZERO, Rational.ZERO],
    [Rational.ZERO, Rational.ZERO, Rational.ZERO],
  ];

  for (const face of mesh.faces) {
    const v0 = V[face[0]!]!;
    // Fan-triangulate the ring; each triangle + the origin is a tetrahedron.
    for (let k = 1; k + 1 < face.length; k++) {
      const a = v0;
      const b = V[face[k]!]!;
      const c = V[face[k + 1]!]!;
      const det = dot(a, cross(b, c)); // signed 6·tetVolume
      sixVol = sixVol.add(det);
      condSum6 = condSum6.add(absR(det));
      const s: RVec3 = [a[0].add(b[0]).add(c[0]), a[1].add(b[1]).add(c[1]), a[2].add(b[2]).add(c[2])];
      for (let i = 0; i < 3; i++) m1[i] = m1[i]!.add(det.mul(s[i]!));
      // Q_ij = a_i a_j + b_i b_j + c_i c_j ; contribution det·(S_i S_j + Q_ij).
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const q = a[i]!.mul(a[j]!).add(b[i]!.mul(b[j]!)).add(c[i]!.mul(c[j]!));
          const term = s[i]!.mul(s[j]!).add(q);
          c120[i]![j] = c120[i]![j]!.add(det.mul(term));
        }
      }
    }
    // Triangulation ambiguity: each internal fan diagonal (v0–v_{k+1}) can flip,
    // moving the volume by the corner tet (v0, v_k, v_{k+1}, v_{k+2}). A triangle
    // has none (planar by definition); a planar quad's corner tet is exactly 0.
    // (A heuristic band — NOT the planarity certificate; see allFacesPlanar.)
    for (let k = 1; k + 2 < face.length; k++) {
      const e1 = sub3(V[face[k]!]!, v0);
      const e2 = sub3(V[face[k + 1]!]!, v0);
      const e3 = sub3(V[face[k + 2]!]!, v0);
      ambig6 = ambig6.add(absR(dot(e1, cross(e2, e3))));
    }
    // Exact planarity — the real triangulation-independence certificate. The
    // Newell normal is exact and robust for a non-planar ring; a face is planar
    // iff it is nonzero AND every vertex lies in the plane it defines through v0.
    // A zero Newell normal (a collinear, zero-area face) is NOT certified planar
    // — conservative, and such a face is caught as a degenerate shipped triangle.
    if (allFacesPlanar) {
      const n = face.length;
      let nx = Rational.ZERO;
      let ny = Rational.ZERO;
      let nz = Rational.ZERO;
      for (let k = 0; k < n; k++) {
        const a = V[face[k]!]!;
        const b = V[face[(k + 1) % n]!]!;
        nx = nx.add(a[1].sub(b[1]).mul(a[2].add(b[2])));
        ny = ny.add(a[2].sub(b[2]).mul(a[0].add(b[0])));
        nz = nz.add(a[0].sub(b[0]).mul(a[1].add(b[1])));
      }
      const N: RVec3 = [nx, ny, nz];
      if (nx.isZero() && ny.isZero() && nz.isZero()) {
        allFacesPlanar = false; // degenerate ring — not a certified plane
      } else {
        for (let k = 1; k < n; k++) {
          if (!dot(sub3(V[face[k]!]!, v0), N).isZero()) {
            allFacesPlanar = false;
            break;
          }
        }
      }
    }
  }

  if (sixVol.isZero()) return null; // no enclosed volume
  // Normalise the winding sign so volume > 0 and the tensor is positive: an
  // inward-wound mesh flips every signed term, which flipping `sign` undoes.
  const sign = sixVol.cmp(Rational.ZERO) < 0 ? rat(-1) : Rational.ONE;
  const volume = sixVol.mul(sign).div(rat(6));
  // centroid = (Σ det·(a+b+c)/24) / volume ; the sign cancels top and bottom.
  const centroid: RVec3 = [
    m1[0].div(rat(24)).div(volume).mul(sign),
    m1[1].div(rat(24)).div(volume).mul(sign),
    m1[2].div(rat(24)).div(volume).mul(sign),
  ];

  // Covariance about the origin: C_ij = (1/120)·Σ det·(S_iS_j + Q_ij), sign-fixed.
  const C: RMat3 = [
    [Rational.ZERO, Rational.ZERO, Rational.ZERO],
    [Rational.ZERO, Rational.ZERO, Rational.ZERO],
    [Rational.ZERO, Rational.ZERO, Rational.ZERO],
  ];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i]![j] = c120[i]![j]!.div(rat(120)).mul(sign);

  // Inertia about the origin: I = tr(C)·Id − C  (I_xx = ∫y²+z² = C_yy+C_zz, etc).
  const trC = C[0]![0]!.add(C[1]![1]!).add(C[2]![2]!);
  const Iorg: RMat3 = [
    [trC.sub(C[0]![0]!), C[0]![1]!.neg(), C[0]![2]!.neg()],
    [C[1]![0]!.neg(), trC.sub(C[1]![1]!), C[1]![2]!.neg()],
    [C[2]![0]!.neg(), C[2]![1]!.neg(), trC.sub(C[2]![2]!)],
  ];

  // Shift to the centroid (parallel-axis): I_c = I_org − M·(|c|²·Id − c⊗c).
  const cc = dot(centroid, centroid); // |c|²
  const inertia: RMat3 = [
    [Rational.ZERO, Rational.ZERO, Rational.ZERO],
    [Rational.ZERO, Rational.ZERO, Rational.ZERO],
    [Rational.ZERO, Rational.ZERO, Rational.ZERO],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const shell = (i === j ? cc : Rational.ZERO).sub(centroid[i]!.mul(centroid[j]!));
      inertia[i]![j] = Iorg[i]![j]!.sub(volume.mul(shell));
    }
  }

  // Characteristic cubic λ³ − tr·λ² + m2·λ − det = λ³ + Aλ² + Bλ + C.
  const A = trace3(inertia).neg();
  const B = minorSum3(inertia);
  const Cc = det3(inertia).neg();
  // Discriminant of λ³+Aλ²+Bλ+C: Δ = 18ABC − 4A³C + A²B² − 4B³ − 27C².
  const A2 = A.mul(A);
  const disc = rat(18)
    .mul(A).mul(B).mul(Cc)
    .sub(rat(4).mul(A2).mul(A).mul(Cc))
    .add(A2.mul(B).mul(B))
    .sub(rat(4).mul(B).mul(B).mul(B))
    .sub(rat(27).mul(Cc).mul(Cc));

  return {
    volume,
    centroid,
    inertia,
    charPoly: [A, B, Cc],
    discriminant: disc,
    symmetryAxis: disc.isZero(),
    volumeAmbiguity: ambig6.div(rat(6)),
    allFacesPlanar,
    conditioning: condSum6.div(rat(6)),
  };
}

const trace3 = (m: RMat3): Rational => m[0][0].add(m[1][1]).add(m[2][2]);

/** Sum of the three principal 2×2 minors — the λ¹ coefficient of a 3×3 char poly. */
const minorSum3 = (m: RMat3): Rational =>
  m[0][0].mul(m[1][1]).sub(m[0][1].mul(m[1][0]))
    .add(m[0][0].mul(m[2][2]).sub(m[0][2].mul(m[2][0])))
    .add(m[1][1].mul(m[2][2]).sub(m[1][2].mul(m[2][1])));

const det3 = (m: RMat3): Rational =>
  m[0][0].mul(m[1][1].mul(m[2][2]).sub(m[1][2].mul(m[2][1])))
    .sub(m[0][1].mul(m[1][0].mul(m[2][2]).sub(m[1][2].mul(m[2][0]))))
    .add(m[0][2].mul(m[1][0].mul(m[2][1]).sub(m[1][1].mul(m[2][0]))));
