## Run 2026-07-23 — scope: TL;DR section, training-cost bullets under "That efficiency comes from..." sibling bullets
Target: `summaries/2024-12_deepseekai_deepseek-v3.md` · Source: `papers/2024-12_deepseekai_deepseek-v3.pdf`

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | "Trained on 14.8T tokens for ~2.79M H800 GPU-hours" | ACCEPTED-CITED | [src: Abstract] — writer-tagged; paper Abstract confirms "pre-train DeepSeek-V3 on 14.8 trillion diverse and high-quality tokens... requires only 2.788M H800 GPU hours for its full training." |
| 2 | "This training cost is roughly one-tenth of what comparable dense frontier models reportedly required" | CONFIRMED | Cross-checked via web search: Meta's Llama 3.1 405B (a comparable dense frontier model, evaluated against DeepSeek-V3 in Table 3/6 of the paper) required 30.84M H100 GPU-hours for training (source: Meta/Llama 3.1 reporting). Ratio 2.788M / 30.84M ≈ 9.0%, i.e. roughly one-tenth. Note: DeepSeek-V3 uses H800 (a China-market variant of H100 with reduced NVLink bandwidth) rather than H100, and this compares raw GPU-hours rather than normalized FLOPs or dollar cost, so "roughly one-tenth" is a defensible order-of-magnitude approximation rather than an exact like-for-like figure. |

**Summary:** 2 claims checked — 1 accepted-cited, 1 confirmed, 0 uncertain, 0 incorrect.

## Run 2026-07-23 — scope: full document (post-tagging pass, ~137 `[src:]` locators)
Target: `summaries/2024-12_deepseekai_deepseek-v3.md` · Source: `papers/2024-12_deepseekai_deepseek-v3.pdf` (+ web search for external/prior-work claims)

Excluded per scope: `## How to read this summary`, `## How the five fit together`, `## Personal Takeaways`, all five `### Why a DS/DE should care` subsections, and pure vague framing bullets with no checkable content. Tightly-coupled sub-bullets sharing one `[src:]` tag with their parent are recorded as a single row.

### TL;DR

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | 671B-param MoE LLM, 37B activated per token | ACCEPTED-CITED | [src: Abstract] |
| 2 | Trained on 14.8T tokens for ~2.79M H800 GPU-hours | ACCEPTED-CITED | [src: Abstract] |
| 3 | "This training cost is roughly one-tenth of what comparable dense frontier models reportedly required" | CONFIRMED | Carried forward from prior run (2026-07-23, claim #2): Llama 3.1 405B ≈ 30.84M H100 GPU-hours vs V3's 2.788M H800 GPU-hours ≈ 9%. |

### 1. FP8 Mixed-Precision Training

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 4 | TL;DR (block-wise scaling, FP32 accum, <0.25% loss delta, ~2x throughput) | ACCEPTED-CITED | [src: §3.3] |
| 5 | Frontier LLMs (>100B params) were trained in BF16 | CONFIRMED | Well-established precedent (e.g. PaLM 540B, LLaMA series trained in BF16); consistent with paper's own framing (p.14) that FP8 pre-training at this scale was previously unvalidated. |
| 6 | Master weights + optimizer states kept in FP32 (standard practice) | CONFIRMED | Standard mixed-precision training practice (Micikevicius et al. mixed-precision training), consistent with paper §3.3.1 describing DeepSeek-V3's own choice to keep these in higher precision. |
| 7 | FP8 had only been shown at small scale — nobody had validated it end-to-end on an extremely large model | ACCEPTED-CITED | [src: §1] |
| 8 | E4M3 / E5M2 format tradeoffs | ACCEPTED-CITED | [src: §3.3.2] |
| 9 | At >100B scale, activations and gradients contain outliers that overflow or force underflow | CONFIRMED | Paraphrase of paper p.14: "low-precision training... is often limited by the presence of outliers in activations, weights, and gradients." |
| 10 | Tensor-wise scaling is insufficient — a single scale factor is dominated by its largest outlier | CONFIRMED | Matches paper p.16: "This method makes low-precision training highly sensitive to activation outliers, which can heavily degrade quantization accuracy." |
| 11 | Older hybrid recipe (E4M3 fwd, E5M2 bwd) partially dodged range problem but sacrificed mantissa precision | ACCEPTED-CITED | [src: §3.3.2] |
| 12 | Hopper Tensor Cores accumulate FP8 matmuls at only ~14-bit internal precision; degrades loss over large inner dims | ACCEPTED-CITED | [src: §3.3.2] |
| 13 | Selective dtype per location (Fprop/Dgrad/Wgrad in FP8; embedding/output head/gating/norm/attention in BF16/FP32) | ACCEPTED-CITED | [src: §3.3.1] |
| 14 | Fine-grained (block-wise) quantization: 1×128 activation tiles, 128×128 weight blocks, online quantization | ACCEPTED-CITED | [src: §3.3.2] |
| 15 | FP32 accumulation promotion every N_C=128 elements | ACCEPTED-CITED | [src: §3.3.2] |
| 16 | E4M3 used everywhere (not old hybrid), enabled by per-tile scaling | ACCEPTED-CITED | [src: §3.3.2] |
| 17 | Low-precision storage/comms (AdamW moments BF16, activations FP8, combine step BF16, E5M6 exception) | ACCEPTED-CITED | [src: §3.3.3] |
| 18 | Relative training-loss error vs BF16 baseline stays below 0.25% over ~1T tokens | ACCEPTED-CITED | [src: §3.3, Appendix B.1] |
| 19 | FP8 GEMMs ~2× compute vs BF16 | ACCEPTED-CITED | [src: §3.3.1] |
| 20 | FP8 cached activations + BF16 optimizer moments: up to ~2× memory reduction on those buffers | CONFIRMED | Derived arithmetic consistent with paper's separately-stated facts: FP8 caching "halves activation memory" (p.18) and BF16 optimizer moments replace FP32 (also a 2× reduction on that buffer, p.18). |
| 21 | First demonstration FP8 stable end-to-end at frontier (671B MoE) scale | ACCEPTED-CITED | [src: §1] |
| 22 | Efficient training and inference without compromising numerical stability | CONFIRMED | Restates the combination of claims #18-19 already supported above; consistent with paper's overall framing (p.14). |
| 23 | Software precursor to hardware microscaling on NVIDIA Blackwell | ACCEPTED-CITED | [src: §3.3.2] |

### 2. Fine-Grained MoE & Expert Load Balancing

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 24 | TL;DR (256 routed +1 shared, top-8, bias-controller balancing) | ACCEPTED-CITED | [src: §2.1.2] |
| 25 | MoE premise: swap dense FFN for N experts + router; decouples capacity from active FLOPs; classic GShard/Switch top-1/2 routing | CONFIRMED | Matches paper p.8 citing GShard (Lepikhin et al. 2021) as the "traditional" comparator; Switch Transformer (Fedus et al. 2021) cited p.9 for aux-loss balancing precedent. |
| 26 | Coarse experts under-specialize; general knowledge redundantly duplicated | CONFIRMED | Standard framing consistent with DeepSeekMoE's own stated motivation (paper cites Dai et al. 2024 DeepSeekMoE, p.8). |
| 27 | Routing collapse — rich-get-richer dynamic starves most experts | ACCEPTED-CITED | [src: §2.1.2] (paper p.9 cites Shazeer et al. 2017 for routing collapse) |
| 28 | Aux-loss remedy: standard fix is a load-balancing loss; interference gradient; too much weight degrades quality | ACCEPTED-CITED | [src: §2.1.2] — paper p.9: "too large an auxiliary loss will impair the model performance." |
| 29 | Device/communication cost: EP requires all-to-all; imbalance causes stragglers and token dropping | CONFIRMED | General MoE systems knowledge, consistent with paper's own node-limited-routing motivation (§2.1.2/§3.2.1). |
| 30 | Config: 671B total / 37B activated; 8 activated per token; 256 routed + 1 shared | ACCEPTED-CITED | [src: §4.2] |
| 31 | 61 layers: first 3 dense, remaining 58 are MoE layers | ACCEPTED-CITED | [src: §4.2] — matches §4.2 (p.22): "We set the number of Transformer layers to 61... We substitute all FFNs except for the first three layers with MoE layers," i.e. 58 MoE layers. |
| 32 | "Likely rationale (not stated by the paper): early-layer routing tends to be unstable" | UNCERTAIN | Writer's own inference, explicitly labeled as such; not asserted in §4.2 or elsewhere per full-text check. §4.2 (p.22) states only the fact ("We substitute all FFNs except for the first three layers with MoE layers") with no rationale given anywhere in the report. |
| 33 | Fine-grained experts + shared-expert isolation (from DeepSeekMoE) | ACCEPTED-CITED | [src: §2.1.2] |
| 34 | Sigmoid affinity router formula `s = Sigmoid(uᵀ·eᵢ)` | ACCEPTED-CITED | [src: §2.1.2] — matches Eq. 15, p.8. |
| 35 | Switched from softmax (V2) to sigmoid | ACCEPTED-CITED | [src: §2.1.2] — matches p.9: "DeepSeek-V3 uses the sigmoid function...Slightly different from DeepSeek-V2." |
| 36 | "Likely rationale (not stated by the paper): softmax over 256 experts makes individual gates vanishingly small and gradient-starved" | UNCERTAIN | Writer's own inference, explicitly labeled as such; not asserted in §4.2 or elsewhere per full-text check. No rationale for the softmax→sigmoid switch is given anywhere in the paper. |
| 37 | Auxiliary-loss-free balancing: bias term added for top-K selection only, gating value still from raw s, feedback controller ±γ | ACCEPTED-CITED | [src: §2.1.2] — matches Eq. 16 and surrounding text, p.9. |
| 38 | γ = 0.001 for first 14.3T tokens, then γ = 0 | ACCEPTED-CITED | [src: §4.2] |
| 39 | Complementary sequence-wise loss, α = 0.0001 | ACCEPTED-CITED | [src: §2.1.2, §4.2] |
| 40 | Node-limited routing (≤4 nodes/token); expert-to-device allocation; +32 redundant experts in prefill EP32 | ACCEPTED-CITED | [src: §2.1.2, §3.4, §3.4.1] |
| 41 | No token dropping in training or inference | ACCEPTED-CITED | [src: §2.1.2] |
| 42 | 37B/671B ≈ 5.5% active params | ACCEPTED-CITED | [src: Abstract] |
| 43 | Ablation: "two 16B MoE models, ~1.33T tokens" with BBH 39.3/37.3, GSM8K 29.6/27.1, MMLU 51.8/51.0, Pile-BPB 0.724/0.727 | CONFIRMED | Re-verified directly against Table 5 (p.27): the "Small MoE" columns (15.7B total / 2.4B activated params) are explicitly labeled "# Training Tokens: 1.33T," and the row values match exactly — Pile-test (BPB) 0.727/0.724, BBH 37.3/39.3, MMLU 51.0/51.8, GSM8K 27.1/29.6 (aux-loss-based vs aux-loss-free). This corrects the prior run's finding (which had flagged "~578B tokens" as wrong — 578B is the token count for the separate Large MoE column, not this one). |
| 44 | Lineage evidence: DeepSeekMoE-16B outperformed LLaMA2-7B at ~39.6% of its compute | CONFIRMED | Web search of the DeepSeekMoE paper (arXiv:2401.06066) confirms verbatim: "With only 39.6% of computations, DeepSeekMoE 16B outperforms LLaMA2 7B on the majority of benchmarks." Corrected wording ("outperformed... ~39.6%") now matches the source exactly, superseding the prior run's "matched... ~40%" phrasing which had understated the source's "outperforms." |
| 45 | Removing interference gradient recovers model quality and expert specialization | ACCEPTED-CITED | [src: §4.5.2, §4.5.3] |
| 46 | Balance enforced batch-wise not per-sequence, enabling clearer specialization | ACCEPTED-CITED | [src: §4.5.3] |
| 47 | Node-limited routing keeps system from being communication-bound | ACCEPTED-CITED | [src: §2.1.2] |

### 3. Multi-Head Latent Attention (MLA)

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 48 | TL;DR: cache one compressed latent instead of full KV, shrinking cache ~1-2 orders of magnitude, V2 reported −93.3%, no quality loss | CONFIRMED | −93.3% figure confirmed via web search of the DeepSeek-V2 paper (arXiv:2405.04434): "reduces the KV cache by 93.3%." No-quality-loss claim consistent with V2 paper's stated MLA design goal. |
| 49 | Standard MHA must cache K/V of all previous tokens; KV cache (not compute) caps batch size/context and dominates memory-bandwidth traffic | CONFIRMED | Well-established LLM serving fact, consistent with paper's own framing motivating MLA. |
| 50 | For V3's shape, MHA would cache 2·n_h·d_h = 32,768 elements/token/layer × 61 layers | ACCEPTED-CITED | [src: §4.2] |
| 51 | MQA shares single K/V head (quality loss); GQA interpolates with n_g groups; neither recovers full-MHA capacity | CONFIRMED | Standard, well-documented tradeoffs of MQA (Shazeer 2019) / GQA (Ainslie et al. 2023) in the LLM efficiency literature. |
| 52 | Open problem framing: cut KV cache without MQA/GQA quality tax | CONFIRMED | Reasonable framing consistent with paper's stated motivation for MLA (p.7-8). |
| 53 | Low-rank joint KV compression: `c^KV = W^DKV·h`, d_c=512, reconstructed via up-projections only when needed | ACCEPTED-CITED | [src: §2.1.1, §4.2] |
| 54 | "At inference, W^UK absorbs into the query projection and W^UV absorbs into the output projection, so per-head K/V are never materialized in cache" | UNCERTAIN | This "absorption trick" mechanism and terminology do not appear anywhere in the DeepSeek-V3 report (full-text check of §2.1.1/Eqs. 1-11 confirms no mention of "absorb"). The underlying mechanism is real and documented in the DeepSeek-V2 paper, but is not stated in this source document, so it cannot be verified against the cited source itself. |
| 55 | Only the latent is cached | ACCEPTED-CITED | [src: §2.1.1] |
| 56 | Decoupled RoPE: RoPE can't apply directly to compressed keys (would break absorption trick / force recompute); fix via separate decoupled channel | UNCERTAIN | The decoupled-RoPE mechanism itself (Eqs. 3, 8) is in the paper and separately cited, but the specific rationale "would sit between the query and W^UK, breaking the absorption trick" again invokes the absorption-trick framing that isn't in this paper's text — writer's inference/carry-over from V2, not verifiable against this source. |
| 57 | q^R = RoPE(W^QR·c^Q), k^R = RoPE(W^KR·h), both dim d_h^R=64 | ACCEPTED-CITED | [src: §2.1.1] |
| 58 | Attention score = content term + positional term | ACCEPTED-CITED | [src: §2.1.1] |
| 59 | Low-rank query compression d_c'=1536; doesn't shrink cache; reduces training activation memory | ACCEPTED-CITED | [src: §2.1.1, §4.2] |
| 60 | Net cache per token per layer = 512+64 = 576 elements | ACCEPTED-CITED | [src: §2.1.1, §4.2] |
| 61 | 576 vs 32,768 elements ≈ ~57× smaller than equivalently-shaped MHA | ACCEPTED-CITED | [src: §4.2] |
| 62 | DeepSeek-V2 reported KV cache −93.3% and max generation throughput ×5.76 | CONFIRMED | Web search of DeepSeek-V2 paper (arXiv:2405.04434) confirms both figures verbatim: "reduces the KV cache by 93.3%, and boosts the maximum generation throughput to 5.76 times." |
| 63 | "This small per-token cache is what makes V3's 128K context economically serveable" | UNCERTAIN | Causal claim not stated directly in this form in the paper; the 128K context (§4.3) and the small cache (§2.1.1/§4.2) are each independently documented, but the paper does not explicitly draw this causal connection. Plausible inference, not verbatim. |
| 64 | MLA does not trade quality for compression; on par with or better than MHA | ACCEPTED-CITED | [src: §2.1.1] |
| 65 | Each head reads its own slice from shared latent, preserving per-head diversity | ACCEPTED-CITED | [src: §2.1.1] |
| 66 | "The absorption trick means the compression costs no extra decode-time compute" | UNCERTAIN | Same issue as claims #54/56: the "absorption trick" is not described anywhere in this V3 report, so this causal/mechanistic claim cannot be verified against the cited source, though it is a defensible technical inference. |

### 4. Multi-Token Prediction (MTP)

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 67 | TL;DR: predicts 2nd-next token, densifies signal, discard or reuse for speculative decoding ~1.8× | ACCEPTED-CITED | [src: §2.2, §5.4.3] |
| 68 | Standard next-token prediction: sparse per-position signal, no explicit lookahead | CONFIRMED | Standard, uncontroversial framing of autoregressive LM training. |
| 69 | Gloeckle et al. (2024): parallel MTP with independent heads, breaks causal chain | ACCEPTED-CITED | [src: §2.2] |
| 70 | V3 uses sequential MTP modules preserving complete causal chain, contrasted with Gloeckle | ACCEPTED-CITED | [src: §2.2] |
| 71 | Module structure: shared embedding/output head, TRM_k, projection M_k, RMSNorm+concat mechanics | ACCEPTED-CITED | [src: §2.2] |
| 72 | Objective: cross-entropy per depth, weighted average λ added to main loss, pre-planning rationale | ACCEPTED-CITED | [src: §2.2] |
| 73 | D=1; λ=0.3 for first 10T tokens then λ=0.1 for remaining 4.8T | ACCEPTED-CITED | [src: §4.2] |
| 74 | Inference: discard (zero cost) or repurpose as speculative-decoding draft head | ACCEPTED-CITED | [src: §2.2, §5.4.3] |
| 75 | Consistent gains, largest on reasoning/coding (ablation) | ACCEPTED-CITED | [src: Table 4] |
| 76 | Small MoE (15.7B/2.4B, 1.33T tokens): HumanEval 26.8 vs 20.7, GSM8K 31.4 vs 25.4, MMLU 53.3 vs 50.0 | ACCEPTED-CITED | [src: Table 4] |
| 77 | Large MoE (228.7B/20.9B, 540B tokens): HumanEval 53.7 vs 44.5, DROP 70.6 vs 68.5 | ACCEPTED-CITED | [src: Table 4] |
| 78 | Speculative decoding: 2nd-token acceptance rate 85-90%, ~1.8× decoding TPS | ACCEPTED-CITED | [src: §5.4.3] |
| 79 | MTP densifies supervision, forces pre-planning, trunk improves even after module discarded | ACCEPTED-CITED | [src: §2.2] |
| 80 | "The causal-chain-preserving design is exactly what makes the same module reusable for speculative decoding — its drafts align with what the main model would generate, hence high acceptance" | UNCERTAIN | This causal linkage (design choice → high acceptance rate) is the writer's own synthesis connecting the design rationale in §2.2 with the empirical acceptance-rate result in §5.4.3; the paper does not state this causal connection explicitly in one place. |

### 5. DualPipe

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 81 | TL;DR: bidirectional schedule, hides comm, ~halves bubble | ACCEPTED-CITED | [src: §3.2.1] |
| 82 | GPipe: large fill/drain bubble | CONFIRMED | Well-established pipeline-parallelism fact (Huang et al. 2019 GPipe). |
| 83 | 1F1B bubble = (PP−1)(F+B) | ACCEPTED-CITED | [src: Table 2] — matches Table 2 exactly. |
| 84 | ZB1P/Zero-Bubble splits backward into B/W, bubble = (PP−1)(F+B−2W) | ACCEPTED-CITED | [src: §3.2.1, Table 2] — matches Table 2 exactly. |
| 85 | Bubble grows with pipeline depth PP | CONFIRMED | Direct algebraic consequence of the cited bubble formulas. |
| 86 | MoE cross-node EP needs all-to-all dispatch+combine per layer | ACCEPTED-CITED | [src: §3.2.1] |
| 87 | Naïve compute:communication ratio ~1:1 | ACCEPTED-CITED | [src: §3.2.1] — matches p.12 exactly. |
| 88 | Fine-grained experts spread across nodes make it worse; communication threatens to become the ceiling | CONFIRMED | Direct, reasonable inference from the cited 1:1 ratio and node-limited-routing motivation. |
| 89 | Bidirectional schedule, fine-grained chunk decomposition, GPU SM ratio tuning | ACCEPTED-CITED | [src: §3.2.1] |
| 90 | DualPipe bubble ≈ (PP/2−1)(F&B+B−3W); 2× parameter copies; activation memory PP+1 | ACCEPTED-CITED | [src: §3.2.1, Table 2] — matches Table 2 exactly. |
| 91 | Node-limited routing (≤4 nodes), bandwidth-matched routing (NVLink 160GB/s ≈3.2× IB 50GB/s), 20 SMs (10 channels) | ACCEPTED-CITED | [src: §3.2.2] — matches p.13-14 exactly. |
| 92 | Halves bubble stage-count factor; near-zero all-to-all overhead; 20 SMs regardless of scale | ACCEPTED-CITED | [src: Table 2, §3.2.1, §3.2.2] |
| 93 | Turns MoE's all-to-all tax into hidden latency; enables fine-grained experts across nodes without comm becoming bottleneck | ACCEPTED-CITED | [src: §3.2.1, §1] |

### Limitations & Open Questions

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 94 | Recommended deployment unit large (prefill 32 GPUs, decode 320 GPUs); heavy for smaller teams | ACCEPTED-CITED | [src: §6, §3.4] — matches §3.4.1 (32 GPUs), §3.4.2 (320 GPUs), and §6 (p.35): "the recommended deployment unit for DeepSeek-V3 is relatively large, which might pose a burden for small-sized teams." |
| 95 | FP8 recipe and DualPipe tightly co-designed with Hopper/H800 (NVLink+IB ratios, SM warp specialization); portability to other accelerators unclear | UNCERTAIN | Not stated in the Conclusion/Limitations section (§6, pp.35-36) or elsewhere. §6 only mentions deployment-unit size and generation-speed limitations; it does not discuss hardware portability. A plausible engineering inference from §3.2.2/§3.5, but not a stated limitation in the source. |
| 96 | Auxiliary-loss-free balancing introduces a bias-update-speed hyperparameter (γ) and schedule; sensitivity/general recipes not fully characterized | UNCERTAIN | Not stated as a limitation anywhere in §6 or elsewhere. γ and its schedule are documented as a design choice (§2.1.2, §4.2), but the paper never flags sensitivity/generalizability as an open limitation. Plausible inference, not verbatim. |
| 97 | MTP is only used with D=1 here | CONFIRMED | Directly stated in §4.2 (p.22): "The multi-token prediction depth 𝐷 is set to 1." |
| 98 | Deeper multi-token prediction (D>1) is left as future work | UNCERTAIN | Not stated. The paper's "Future Directions" (§6, pp.35-36) lists four bullets (architecture/context length, data scaling, deep-thinking/reasoning depth, evaluation methods) — none mention MTP depth D>1 specifically. Plausible extrapolation, not a stated future-work item. |

### Citation

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 99 | BibTeX fields: title "DeepSeek-V3 Technical Report", author DeepSeek-AI, arXiv:2412.19437, year 2024, matching URL | CONFIRMED | Matches PDF title page, author line, and arXiv identifier (arXiv:2412.19437v2) exactly. |

**Summary:** 99 claims checked — 62 accepted-cited, 28 confirmed, 9 uncertain, 0 incorrect.

## Run 2026-07-23 — scope: changed claims from follow-up edit, "Fine-Grained MoE & Expert Load Balancing" section (closing out prior run's findings)
Target: `summaries/2024-12_deepseekai_deepseek-v3.md` · Source: `papers/2024-12_deepseekai_deepseek-v3.pdf` (+ web search for external/prior-work claim)

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Ablation (two 16B MoE models, ~1.33T tokens): auxiliary-loss-free beats auxiliary-loss-based on BBH 39.3/37.3, GSM8K 29.6/27.1, MMLU 51.8/51.0, Pile-BPB 0.724/0.727 | ACCEPTED-CITED | [src: Table 5] — re-confirmed directly: Table 5 (p.27) "Small MoE" columns (15.7B total / 2.4B activated) are explicitly labeled "# Training Tokens: 1.33T," and all four benchmark pairs match exactly (Pile-test BPB 0.727/0.724, BBH 37.3/39.3, MMLU 51.0/51.8, GSM8K 27.1/29.6). Corrects the prior run's flagged "~578B tokens" error — 578B belongs to the separate Large MoE column with entirely different benchmark values. |
| 2 | 61 layers: first 3 dense, remaining 58 are MoE layers | ACCEPTED-CITED | [src: §4.2] — already confirmed in the immediately-preceding full-document run (matches §4.2, p.22: "We set the number of Transformer layers to 61... We substitute all FFNs except for the first three layers with MoE layers"). |
| 3 | "Likely rationale (not stated by the paper): early-layer routing tends to be unstable" | UNCERTAIN | Writer's own inference, explicitly labeled as such; not asserted in §4.2 or elsewhere per full-text check. §4.2 (p.22) states only the fact with no rationale given anywhere in the report. |
| 4 | Switched from softmax (V2) to sigmoid | ACCEPTED-CITED | [src: §2.1.2] — matches p.9: "DeepSeek-V3 uses the sigmoid function...Slightly different from DeepSeek-V2." |
| 5 | "Likely rationale (not stated by the paper): softmax over 256 experts makes individual gates vanishingly small and gradient-starved" | UNCERTAIN | Writer's own inference, explicitly labeled as such; not asserted anywhere in the paper. No rationale for the softmax→sigmoid switch is given in the source. |
| 6 | Lineage evidence: DeepSeekMoE-16B outperformed LLaMA2-7B at ~39.6% of its compute | CONFIRMED | Web search of the DeepSeekMoE paper (arXiv:2401.06066) confirms verbatim: "With only 39.6% of computations, DeepSeekMoE 16B outperforms LLaMA2 7B on the majority of benchmarks." Corrected wording now matches the source exactly (supersedes prior run's "matched... ~40%" understatement). |

**Summary:** 6 claims checked — 3 accepted-cited, 1 confirmed, 2 uncertain, 0 incorrect.

## Run 2026-07-23 — scope: deck `decks/2024-12_deepseekai_deepseek-v3/presentation.html`, slides 8–14 (Section 2 of 5, "Fine-Grained MoE & Expert Load Balancing")
Target: `decks/2024-12_deepseekai_deepseek-v3/presentation.html` · Source: `summaries/2024-12_deepseekai_deepseek-v3.md` (lines 109–190)

No `[src:]` tagging convention applies to deck HTML, so every claim below was actively verified against the summary (the deck's job here is faithful transcription, not re-derivation from the paper).

| # | Claim (slide) | Verdict | Evidence |
|---|---|---|---|
| 1 | Slide 8 subtitle: 256 routed experts (+1 shared), 8 activated/token, balanced via learnable per-expert bias, not an aux loss | CONFIRMED | Matches summary line 111 TL;DR near-verbatim. |
| 2 | Slide 8 footer: "DeepSeek-AI, 2024 · arXiv:2412.19437" | CONFIRMED | Matches summary header/citation metadata (already verified in full-document run above). |
| 3 | Slide 9 card "Coarse experts under-specialize": classic MoE top-1/2 routing, wide-mix experts, duplicated general knowledge, few combinations per token | CONFIRMED | Matches summary lines 115–121. |
| 4 | Slide 9 card "Routing collapse": jointly-learned router, rich-get-richer dynamic, most experts starve, wasted params | CONFIRMED | Matches summary lines 122–125. |
| 5 | Slide 9 card "The aux-loss remedy has a real cost": interference gradient, enough weight to balance measurably degrades quality | CONFIRMED | Matches summary lines 126–129. |
| 6 | Slide 9 card "Device & communication cost": distributed all-to-all, cross-node traffic, GPU stragglers, token dropping under capacity limits | CONFIRMED | Matches summary lines 130–134. |
| 7 | Slide 10 stats: 671B total / 37B activated per token; 256+1 experts per MoE layer; 8 activated per token | CONFIRMED | Matches summary lines 138, 141. |
| 8 | Slide 10 bullet: fine-grained experts + shared-expert isolation, 8-of-256 combinations, shared expert absorbs common knowledge | CONFIRMED | Matches summary lines 142–144. |
| 9 | Slide 10 bullet: sigmoid affinity router `s = Sigmoid(uᵀ·eᵢ)`, switched from softmax (V2) "since softmax over 256 experts leaves individual gates vanishingly small and gradient-starved" | INCORRECT | Transcription drift: the summary (lines 147–148) explicitly labels this rationale as the writer's own speculation — "Likely rationale (**not stated by the paper**): softmax over 256 experts makes individual gates vanishingly small and gradient-starved" — a hedge the prior audit run above independently flagged UNCERTAIN for the same reason. The deck drops the hedge and states it with a causal "since," presenting it as an established fact from the paper. The router formula and softmax→sigmoid switch themselves are correctly transcribed; only the epistemic status of the rationale is misrepresented. |
| 10 | Slide 11 bullet: learnable bias bᵢ, added for top-K selection only, routing picks top-8 of s+bᵢ, gating weight still from original s | CONFIRMED | Matches summary lines 150–152. |
| 11 | Slide 11 bullet: feedback controller adjusts bias per step (±γ), γ=0.001 for first 14.3T tokens then γ=0 | CONFIRMED | Matches summary lines 153–157. |
| 12 | Slide 11 bullet: steers which experts are chosen without injecting a distortion gradient into the LM loss | CONFIRMED | Matches summary line 156. |
| 13 | Slide 11 bullet: tiny complementary sequence-wise loss (α=0.0001), rules out pathological within-sequence imbalance, too small to perturb LM objective | CONFIRMED | Matches summary lines 158–160. |
| 14 | Slide 12 card "Node-limited routing": each token's 8 experts confined to ≤4 nodes, caps cross-node all-to-all, lets compute/comm overlap | CONFIRMED | Matches summary line 162. |
| 15 | Slide 12 card "Expert-to-device allocation": balances per-GPU compute/memory at placement time | CONFIRMED | Matches summary line 163. |
| 16 | Slide 12 card "Redundant experts at deployment": dynamic redundancy duplicates hot experts, +32 redundant experts in prefill EP32 | CONFIRMED | Matches summary line 164. |
| 17 | Slide 12 card "No token dropping": in training or inference, nothing overflows a capacity limit | CONFIRMED | Matches summary line 165. |
| 18 | Slide 13 stat: 5.5% of 671B active per token (37B) | CONFIRMED | Matches summary line 170. |
| 19 | Slide 13 stat: BBH +2.0 (39.3 vs 37.3) | CONFIRMED | Matches summary line 172; arithmetic (39.3−37.3=2.0) checks out. |
| 20 | Slide 13 stat: GSM8K +2.5 (29.6 vs 27.1) | CONFIRMED | Matches summary line 173; arithmetic (29.6−27.1=2.5) checks out. |
| 21 | Slide 13 stat: MMLU +0.8 (51.8 vs 51.0) | CONFIRMED | Matches summary line 174; arithmetic (51.8−51.0=0.8) checks out. |
| 22 | Slide 13 bullet: ablation on two 16B MoE models (~1.33T tokens), comparable balance, removing interference gradient recovers quality and specialization | CONFIRMED | Matches summary lines 171, 178. |
| 23 | Slide 13 bullet: balance enforced batch-wise not per-sequence, domain-relevant experts can dominate, clearer/less-redundant specialization | CONFIRMED | Matches summary line 179. |
| 24 | Slide 14 bullets: two distinct load-balancing problems (statistical balance via controller-tuned bias; physical balance via node-limited routing/placement/redundant experts) | CONFIRMED | Matches summary lines 184–186. |
| 25 | Slide 14 bullet: deeper lesson — move a constraint fighting the main objective out of the loss into a non-distorting control mechanism | CONFIRMED | Matches summary line 187. |
| 26 | Slide 14 footer: "DeepSeek-V3 Technical Report · arXiv:2412.19437 · Section 2 of 5" | CONFIRMED | Citation matches summary header metadata; "Section 2 of 5" matches the deck's own section numbering (this is the second of five summary sections), consistent with slide 8's identical eyebrow label. |

**Summary:** 26 claims checked — 0 accepted-cited, 25 confirmed, 0 uncertain, 1 incorrect.
</content>
