# Graphics assets

The following asset files are included under [CC0](https://polyhaven.com/license):

- [Modern Arm Chair 01](https://polyhaven.com/a/modern_arm_chair_01), by Vibrant Nordic, via Poly Haven. Authored glTF mesh and 2K base colour, normal and packed material maps. Used for the CEO lounge chair.
- [Brown Leather](https://polyhaven.com/a/brown_leather), via Poly Haven. 1K diffuse, OpenGL normal and roughness maps. Used for office leather surfaces.
- [Tree Small 02](https://polyhaven.com/a/tree_small_02), by Rico Cilliers, and [Fir Sapling](https://polyhaven.com/a/fir_sapling), via Poly Haven. Authored geometry and 1K PBR maps. Game meshes are simplified offline with meshoptimizer, preserving texture coordinates. Sources and derived checksums are recorded in `src/renderer/assets/nature-assets.json`.

Source URLs, downloaded filenames and checksums are recorded in `src/renderer/assets/realism-assets.json`. Reimport with `node tools/import-realism-assets.cjs`. Poly Haven preview images and website content are not bundled.

The CEO desk, executive chair, keyboard and mug geometry in `office-realism.js` is authored for Deskly. Existing office texture credits remain in the material manifest.

## Detailed employees

The bundled employee GLBs derive from [MakeHuman's core graphics assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html), released under CC0. This includes the base mesh, shape targets, skeleton/weights, young skin textures, high-poly eyes, eyebrows, short/bob/ponytail hair, male casual/elegant suits, female elegant/casual suits and Shoes 03 footwear. The [MakeHuman licence](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md) separates graphics assets from application code. MakeHuman program code is not bundled or executed in Deskly. The complete source licence is included with the character files.

The converter in `tools/build-human-assets.py` fits garments and transfers skin weights, removes covered body faces, converts UV orientation, embeds textures, and exports four skinned GLBs with two additional authored full-body identity targets and outfit variants. Hair and eyebrow colour is neutralized from the authored maps while retaining strand detail and alpha. Face morphs are also fitted to eyes, hair and eyebrows. Source hashes are recorded in `assets/characters/sources.json`; generated GLB hashes are in the character manifest.

Deskly's existing behaviour animator drives these models through a world-space retargeting adapter. Walking, sitting, typing, gestures, head turns and hand props remain controlled by employee behaviour. Each employee has its own skeleton. The team editor provides model selection, height, build width, two face blends, skin shade, three hairstyles, hair colour and outfit tint. Individual wardrobe shapes and more hairstyles require additional authored assets. Complete lip sync and expressive facial animation remain future work.

To rebuild the graphics sources, prepare the system ZIP in `.cache/asset-sources/makehuman-system.zip` from the source pack URL recorded above, run `node tools/import-human-sources.cjs`, then run `python tools/build-human-assets.py` with numpy and Pillow installed. To rebuild trees, install meshoptimizer under `.cache/graphics-tools` and run `node tools/import-nature-assets.mjs`. Build tools and raw downloads are excluded from the shipped app.

## Bringing in another employee model

Additional models can use a redistributable, self-contained **GLB** with a skinned humanoid rig and **in-place Idle, Walk and Sit** clips. Include textures and a source/licence record. Higher quality anatomy, hair and clothing must come from the source model.

Add an entry to `src/renderer/assets/characters/manifest.json`:

```json
{
  "id": "business-person",
  "label": "Business person",
  "path": "assets/characters/business-person.glb",
  "clips": {"stand":"Idle", "walk":"Walk", "sit":"Sit", "sitType":"Typing"},
  "rightHand": "RightHand",
  "referenceSeatHeight": 0.5,
  "facingYaw": 0
}
```

The model should face +Z after `facingYaw` (radians), and have its resting feet at ground level. `referenceSeatHeight` is the seated height at the normalized 1.75m character scale. Verify chair alignment against both desk and meeting seats. Optional clips can cover other existing behaviour modes. Unmapped actions use idle or sit; convincing typing, drinking and speech require authored animations, facial animation and prop attachment tuning. The loader does not generate those animations.

The team editor offers successfully loaded models. Each employee receives its own skeleton and animation mixer. Invalid models are skipped and the original characters remain available. Paid model licences must allow the intended app distribution; do not put restricted raw models in the public repository.

Distance-detail tree indices are derived offline from the same CC0 game meshes by `tools/build-tree-lods.mjs`. The original near meshes and textures are retained. Medium/far detail shares existing materials; generated index hashes are recorded in `nature-assets.json`.
