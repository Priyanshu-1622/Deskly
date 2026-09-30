# Third-party notices

Deskly includes vendored Three.js code in `src/renderer/vendor/`:

- `three.min.js` (Three.js r147)
- `GLTFLoader.js`
- `BufferGeometryUtils.js`

Three.js is copyright the Three.js authors and is licensed under the MIT License. Its [license and source](https://github.com/mrdoob/three.js/blob/master/LICENSE) remain with their original authors. Deskly's generated office model is built from the source in `tools/build_office.py`.

## Office surface textures

The photographed diffuse, OpenGL normal, and roughness maps in `src/renderer/assets/materials/` come from [Poly Haven](https://polyhaven.com/license) and are released under CC0. The maps were downloaded at 1K resolution; Deskly preserves each material's original surface detail and applies it to the existing office mesh without changing the mesh geometry.

| Material set | Author | Source |
| --- | --- | --- |
| Oak Veneer 02 | Jenelle van Heerden | https://polyhaven.com/a/oak_veneer_02 |
| Walnut Veneer | Jenelle van Heerden | https://polyhaven.com/a/walnut_veneer |
| Wood Floor | Dimitrios Savva | https://polyhaven.com/a/wood_floor |
| White Stucco | Amal Kumar | https://polyhaven.com/a/white_stucco |
| Rough Concrete | Dimitrios Savva | https://polyhaven.com/a/rough_concrete |
| Poly Wool Herringbone | Rico Cilliers, colormass | https://polyhaven.com/a/poly_wool_herringbone |
| Rough Linen | Rico Cilliers, colormass | https://polyhaven.com/a/rough_linen |

The compact indoor reflection image used for glass and metal is a resized version of [Small Empty Room 3](https://polyhaven.com/a/small_empty_room_3) by Sergej Majboroda, also CC0 from Poly Haven.
