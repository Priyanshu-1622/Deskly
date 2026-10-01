# Deskly realism direction

Research and project audit: 1 October 2026.

## Target

A believable contemporary corporate office at first-person viewing distance: natural human anatomy, tailored clothing, manufactured furniture, clean architectural finishes, readable material detail and lighting that gives objects weight. Keep Deskly's established floor plan, room sizes, walkways, workstation positions and interaction points. Upgrade the visual assets inside that structure.

The target is a playable scene. A marketplace beauty render is useful for art direction, but it is not proof of how an asset will look or perform in Deskly.

## References to examine

| Reference | What to study | How it applies to Deskly |
| --- | --- | --- |
| [Leartes / Thomas Ongo: Modern Office Environment](https://leartesstudios.artstation.com/projects/OmnLgk) | A complete modern office with consistent furniture design, material separation and professional scene finishing. The creator describes 110 meshes intended for game use. | Primary reference for the office's visual coherence. Match the quality of individual desks, chairs, partitions and small props while retaining our layout. |
| [Thiago Klafke: Office Environment Modular Kit](https://cubebrush.co/thiagoklafke/products/ikf8pq/office-environment-modular-kit) | Reusable office pieces and a source asset workflow. The creator lists FBX/Maya sources, textures, materials and lightmap UVs. | Reference for modular replacements that can fit the existing office instead of importing a different whole building. |
| [Poly Haven: Modern Arm Chair 01](https://polyhaven.com/a/modern_arm_chair_01) | Curved frame, cushion construction, grain direction and distinct wood/leather response. The listing offers glTF/Blend/FBX and material maps. | A free, portable furniture candidate and a useful standard for silhouette and close inspection. Fit selected furniture to existing placement and seat anchors. |
| [Poly Haven: Mid Century Lounge Chair](https://polyhaven.com/a/mid_century_lounge_chair) | Separate shell, upholstery and base; useful detail at a modest mesh complexity. | Candidate for lounge furniture, provided its dimensions fit the existing seat footprint. |
| [ActorCore: Business-F-0041](https://actorcore.reallusion.com/3d-character?asset=business-f-0041) | Scanned body/clothing detail, business attire, PBR maps, body/facial rig and expression shapes. | Candidate for employees seen around the office. Close conversations require evaluation of face detail, eye materials and rig deformation before adopting it. |
| [Reallusion character specifications](https://www.reallusion.com/content/characterspec/) | The maker distinguishes crowd-oriented ActorSCAN/ActorBUILD from close-view actorORIGIN characters with separate human shaders. | Use crowd assets for background employees only if they also hold up at Deskly's interaction distance. Evaluate a more detailed character for face-to-face conversations. |
| [Dekogon: Stationary Set 01a](https://www.renderhub.com/dekogon-studios/stationary-set-01a) | Recognizable manufactured props, real-world scale, pivots and material maps. The seller lists FBX/GLB/OBJ. | A detail benchmark for desktop objects. Its published mesh count needs inspection before using a full set in this app. |

These are creator or vendor references, not downloaded or integrated assets. No purchase was made. Unreal scene lighting, engine material graphs and rendering features should not be assumed to transfer with an FBX or GLB.

## What makes the current scene look simplified

These findings come from Deskly's current source code; the repository's meeting screenshot also shows the original simplified character and furniture shapes.

| Current implementation | Visible consequence | Required change |
| --- | --- | --- |
| `human.js` constructs heads, limbs, clothing and hair from spheres, capsules, boxes and lathed shapes. Most surfaces share a vertex-colour material. | Simplified faces, rounded hair clumps and smooth clothing dominate the silhouette. Surface textures alone cannot supply the missing shape. | Introduce authored, skinned character meshes with proper facial anatomy, hands, clothing folds, hair and material separation. |
| `tools/build_office.py` builds much of the furniture from procedural geometry. | Basic seat cushions, rectangular desks and simplified object construction remain visible up close. | Refine or replace selected furniture meshes at their current positions, with bevels, seams, joinery, padding, casters and realistic thickness. |
| `office-materials.js` projects UV coordinates onto an original mesh without authored UVs. | Projected textures provide detail but cannot reliably follow grain, cushion seams or individual manufactured parts. | Author UVs for prominent furniture and props; keep consistent physical texture scale. Large walls and floors can use controlled tiling. |
| The same material group gives leather the linen texture. Metal uses concrete normal/roughness images as microdetail; several unrelated painted/plastic surfaces use stucco detail. | Materials may have detail but resemble the wrong substance. | Dedicated leather grain, brushed or coated metal, plastic, paint, fabric and ceramic treatments. Separate exposed metal from painted coatings. |
| `game.js` does not enable renderer shadow maps; the lights do not configure shadow casting, and office meshes do not set shadow reception. | Missing cast shadows and weak visual grounding beneath people and objects. | Configure bounded dynamic shadows and static occlusion/baked lighting, with checks for cost, light leaks and shadow artifacts. |
| Environment lighting uses one JPEG reflection panorama, with ambient and directional fill. There are no lightmap or ambient-occlusion maps on the current office pass. | Reflective response and interior light distribution are approximations; corners and contact areas lack detail. | Evaluate an HDR environment with proper filtering, authored AO/lightmaps and restrained dynamic lighting. Match reflections to time and interior conditions. |

Three.js documents that shadow casting requires renderer, light and mesh configuration, and that additional shadow lights render extra scene passes. This makes one carefully bounded sun shadow and selective local lighting a better starting point than enabling shadows on every office light. [Three.js shadows](https://threejs.org/manual/pages/shadows.html)

The material documentation also distinguishes normal detail from actual geometry: normals alter lighting, while the silhouette remains the same. Its PBR workflow supports normal, roughness, metalness, environment, AO and light maps. [Three.js MeshStandardMaterial](https://archive.threejs.org/docs/api/en/materials/MeshStandardMaterial.html)

## Art requirements

### People

- Natural proportions and convincing head, nose, lips, eyelids, ears, fingers and hands.
- Distinct skin, eyes, hair, clothes and shoes; natural skin variation without baked lighting or exaggerated blemishes.
- Hair with strand detail and a believable hairline, using a tested real-time representation.
- Clothing seams, collar thickness, buttons, cuffs, folds and fabric direction; deformation that holds up when sitting.
- A proper skeleton, body skin weights, blink and expression shapes, and separate eyes where appropriate.
- Reusable idle, walk, sit, stand, type, drink and conversation animations, with foot contact, seat alignment and smooth transitions.
- Variation in faces, outfits and proportions across the team. Palette swaps of one character are insufficient for the final team.

### Furniture and objects

- Rounded or bevelled exposed edges sized like real manufacturing details, rather than a large generic rounded-box effect.
- Realistic thickness, separate construction pieces, handles, hinges, castors, controls and visible seams where appropriate.
- Upholstery grain, stitching and cushion compression; desk grain aligned with the construction.
- Ceramic cups with wall thickness and a clean glaze; machines with recognizable controls, trays, openings and labels.
- Clean modern finishes with restrained signs of use. Heavy scratches, noisy grunge and identical wear on every object do not fit this office.
- Material detail that remains readable in neutral daylight and does not rely on a dramatic cinematic camera effect.

### Architecture and image quality

- Keep the current plan and interaction anchors; use a replacement footprint compatible with each original object.
- Refine trim, frame profiles, glass thickness, skirting, ceiling and junction detail without narrowing navigation routes.
- Neutral and believable material colours, clear but restrained reflections, stable shadows and contact shading.
- Check close views as well as whole-room shots. Avoid excessive bloom, sharpen filters, depth of field or texture noise as substitutes for asset detail.

## Asset intake specification

Preferred app format: **GLB**, with mesh, PBR materials, textures, skeleton and animations included. A glTF plus its BIN and texture folder is also usable. **FBX or BLEND** are useful authoring sources and can be converted to GLB after material and animation checks. OBJ is suitable for static objects but not the preferred format for employees.

Each asset should come with:

- Complete colour, normal, roughness and metalness maps, plus AO, opacity and emission where relevant. Use the OpenGL normal convention or explicitly convert it.
- Real-world dimensions, useful object names, valid UVs, transforms and a sensible pivot.
- Separate moving parts for doors, drawers, screens, handles and other interactive pieces.
- Character bind pose, bone names, skin weights and animations when applicable.
- A clay or wireframe view and a neutral-light preview so geometry can be distinguished from lighting effects.
- Source URL, author and the applicable licence record.

Start with 2K textures for ordinary props and evaluate 4K on prominent characters or furniture. These are initial working choices, not measured limits. Optimize repeated furniture, skinning, draw calls, textures and distant detail after inspecting runtime performance on the target machine.

Poly Haven's assets use CC0, which fits assets included in Deskly's public source repository. Paid vendor assets need their own distribution arrangement: an app-use licence must not be assumed to permit publishing the raw source files in the public repository. [Poly Haven licence](https://polyhaven.com/license)

## Implementation order

1. **Measure the current renderer.** Record frame timing, draw calls, triangles and texture usage at a desk, a full meeting and the main aisle; retain comparison screenshots at a fixed camera and time.
2. **Build one reference-quality workstation.** Improve one desk, chair, monitor, keyboard, cup and nearby architectural finishes at the existing location. Add shadow/contact shading and correct material families. Confirm quality from the player's standing and seated views.
3. **Integrate one realistic employee.** Build an asset-backed visual rig behind the existing employee behaviour interface. Validate walking, sitting, typing, head turns and current interaction controls before replacing the full roster.
4. **Expand proven assets.** Reuse the accepted furniture with material and model variants; add coherent realistic employees and props while preserving room layout and navigation.
5. **Finish the scene lighting.** Compare day, sunset and night, ensure the sun does not illuminate through walls, and align environment reflections and indoor lights. Optimize after each expansion.

The first completed workstation and character should be the acceptance sample. Scaling the existing simplified asset style across the whole scene before validating that sample would leave the same visual problem at a larger scope.

## Acceptance checks

- A first-person face-to-face view shows believable anatomy, hair, hands and clothing without flat colour-only patches.
- The desk and chair read as manufactured objects in silhouette, even with colour maps disabled.
- Wood, cloth, leather, plastic, coated metal and exposed metal remain visibly distinct under the same light.
- People and objects feel grounded; no obvious floating contact, shadow acne or light leaking through solid room geometry.
- All current seats, workstation screens, doors, coffee actions, meeting positions and navigation routes still work.
- Performance measurements accompany the visual comparison; no frame-rate claim is made before measurement.

This document records the researched target and the current gap. It does not claim that the realistic asset replacement has already been implemented.
