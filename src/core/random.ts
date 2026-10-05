export function random(state: { rng: number }) {
  let x = state.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0; return state.rng / 4294967296;
}
