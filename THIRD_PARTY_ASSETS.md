# Third-party visual assets

## Main anime hero

The hero uses **VRM1_Constraint_Twist_Sample v1.0.1**, authored by **pixiv Inc.**, **(c) 2022 pixiv Inc.** It is a publicly available sample model, not an original character mesh created for this project. No assets from Genshin Impact or other commercial games were extracted.

- Project file: `public/models/neighborhood-hero.vrm`.
- Official source repository: [pixiv/three-vrm](https://github.com/pixiv/three-vrm).
- [Exact source file, pinned to commit 68c7d6b1f73b79568f81139be62831968bff7876](https://raw.githubusercontent.com/pixiv/three-vrm/68c7d6b1f73b79568f81139be62831968bff7876/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm).
- [Official sample description and license notice](https://github.com/vrm-c/vrm-specification/tree/master/samples/VRM1_Constraint_Twist_Sample).
- Source file SHA-256: `12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2`.
- Size: 10,776,032 bytes. Retrieved 2026-10-21. The distributed VRM is byte-for-byte unchanged.

### License and settings

The model uses the **[VRM Public License 1.0](https://vrm.dev/en/licenses/1.0/)**, together with its embedded settings. It is **not** covered by the three-vrm library's MIT license and is **not** CC0.

The complete authoritative license is also distributed locally as [VRM-Public-License-1.0.pdf](public/models/licenses/VRM-Public-License-1.0.pdf), downloaded from [the official PDF](https://vrm.dev/licenses/1.0/pdf/en.pdf). The complete unmodified metadata is [hero-license-settings.json](public/models/licenses/hero-license-settings.json).

| Embedded setting | Value | Effect for this asset |
| --- | --- | --- |
| `avatarPermission` | `everyone` | Any person may use the avatar. |
| `commercialUsage` | `corporation` | Commercial use, including corporate use, is permitted. |
| `allowRedistribution` | `true` | Redistribution of the original model is permitted. |
| `modification` | `allowModificationRedistribution` | Modification and redistribution of modifications are permitted. |
| `creditNotation` | `unnecessary` | Attribution is optional; this project provides it voluntarily. |
| `allowAntisocialOrHateUsage` | `false` | Antisocial or hate expressions are prohibited under the license definitions. |
| `allowExcessivelySexualUsage` | `true` | No additional model-setting prohibition for this category. |
| `allowExcessivelyViolentUsage` | `true` | No additional model-setting prohibition for this category. |
| `allowPoliticalOrReligiousUsage` | `true` | No additional model-setting prohibition for this category. |
| `licenseUrl` | `https://vrm.dev/licenses/1.0/` | License identifier embedded in the model. |

The license also prohibits restricting recipients' licensed rights in the original model and implying endorsement by pixiv. Modified VRM redistribution has additional adapter-license conditions. Patent, trademark and personality rights are not generally licensed. The model is provided without warranties; noncompliance can terminate the license. Read the full distributed license for definitions, attribution conditions where applicable, adaptation terms, disclaimers, termination and reinstatement provisions. This notice does not replace those terms. No additional usage terms are present in the embedded metadata.

### Technical inspection

The source contains **36,470 triangles and 13 surface primitives**, arranged in three glTF meshes and three skin bindings. The rendered hero with the original satchel contains **37,274 triangles and 17 mesh draws** before shadow passes: 13 skinned surfaces plus four accessory meshes. Compatible skin bindings become **one Skeleton** at runtime. There are 154 unique source skin joints and 54 mapped humanoid bones. The face includes 57 morph targets per face primitive, with VRM expressions, and the asset supplies spring-bone hair and twist constraints. There are no embedded animation clips.

It uses 18 working images plus a 2048×2048 thumbnail. Working image resolutions range from 256×256 to 2048×2048, with the shirt at 1024×2048. All 13 surface materials are opaque. Runtime MToon rendering retains the original face, eyes, hair and texture detail; the outline pass is disabled. The loader combines compatible skeletons and morph targets and removes unused vertices in memory. The model and textures are retained in a single bounded cache; it is mounted once on mutually exclusive game/review routes, not duplicated for NPCs.

### Project modifications

The original binary, skinning, facial topology, clothing topology, textures and license metadata are unchanged. Runtime changes set a 1.72 m standing height, tint the shirt teal (or the player's saved color), give shorts a navy cast and shoes a cream cast, adjust MToon lighting, disable outline passes, and add an original coral satchel accessory. The accessory is procedural geometry; the hero's body, face, hands, hair and clothing remain the actual skinned sample mesh.

The project supplies procedural skeletal idle, walk/jog, run, jump, fall, landing and carrying states, plus blinking. These are not motion-capture clips. Grounded locomotion uses actual KCC distance and measured unequal-length two-bone leg IK; contact targets compensate for body travel. Existing gameplay speeds remain 4.2 m/s and 6.8 m/s, using approximately 1.87 and 2.06 full leg cycles per second respectively. At these speeds the ordinary movement pose is a jog. KCC alone controls world translation, heading and collision; animations do not supply root motion. Carry targets use the physical item attachment position and the model's arm lengths. These first-pass procedural states still require visual playtesting; mathematical target checks alone do not establish animation quality.

## Runtime library

`@pixiv/three-vrm` 3.5.5 renders the avatar and its VRM extensions. The library is under the [MIT License](https://github.com/pixiv/three-vrm/blob/dev/LICENSE), separately from the model license above. Its full copyright and permission notice is shipped as [three-vrm-MIT.txt](public/models/licenses/three-vrm-MIT.txt). Its dependencies and license notices remain in the installed packages and lockfile.

## Concept and previous references

`docs/third-person/concept.png` is an AI-generated art-direction image; it is not the rendered game, not a source model, and not a gameplay capture. Earlier PEAK reference images were viewed as references only and are not shipped as game textures or models. Other existing neighborhood meshes and the NPC placeholder are project-authored procedural geometry.
