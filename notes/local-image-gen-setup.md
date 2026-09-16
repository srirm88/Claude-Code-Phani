# Local image and video generation on an RTX 5070 Ti

Setup notes for running open-weight image and video models locally on a
Windows PC with an NVIDIA RTX 5070 Ti, using WSL2 as the Linux environment
and ComfyUI as the host.

Personal-project notes. Nothing here is used by the ACE skills or the
install/bundle scripts.

## Why WSL2 (or bare-metal Ubuntu) and not VMware

VMware Workstation and Player do not pass the GPU through to a Linux guest.
The guest sees a virtual SVGA adapter, not the NVIDIA card, so there is no
CUDA inside the VM and every model falls back to CPU. The "3D acceleration"
checkbox accelerates the virtual display only; PyTorch will not see a CUDA
device. GPU passthrough exists only on ESXi and vSphere.

WSL2 gets CUDA natively from the Windows NVIDIA driver. Same Linux workflow,
real GPU. On a self-built box, bare-metal Ubuntu is the other option: no
Windows licence, no virtualization layer, same ComfyUI steps minus the WSL2
section.

## Hardware

Starting point: Dell OptiPlex Tower Plus 7020 with an i7-14700, 64 GB DDR5
UDIMM, 1 TB NVMe. The Dell chassis cannot take the card: proprietary PSU
(260 W or 500 W, no 12V-2x6, no standard ATX swap), GPU length limit around
250 mm, Dell-supported ceiling is an RTX 4060 8 GB. So the CPU, RAM, and
SSD move to a standard build and the Dell becomes a spare shell.

| Part | Pick | Approx KWD |
|---|---|---|
| Motherboard | Gigabyte B760M DS3H Gen5, LGA1700, 4x DDR5, PCIe 5.0 x16, 2x M.2 | 45 |
| Case | Mesh-front ATX mid-tower, 330 mm GPU clearance | 21 to 26 |
| CPU cooler | Thermalright Assassin X 120 SE (Dell cooler does not fit a standard board) | 11 |
| PSU | 850 W ATX 3.1 with native 12V-2x6, e.g. SilverStone DA850R | 37 |
| GPU | RTX 5070 Ti 16 GB GDDR7, Gigabyte Aero OC via Amazon.ae, or Inno3D X3 OC at Microless Kuwait | 330 or 420 |
| Moved from Dell | i7-14700, 64 GB DDR5, 1 TB NVMe | 0 |

Build checklist:

- Flash the board to the latest BIOS before first real use. The i7-14700 is
  Raptor Lake; use the Intel Default Settings power profile, never an
  unlimited or "performance" preset.
- Set PL1 = 125 W, PL2 = 150 W. More than Dell gives it, within the cooler.
- Leave XMP off. Dell modules are 4400 or 5600 MT/s JEDEC; run them as-is.
- Windows licence is Dell OEM. Boot the moved SSD first; it usually
  reactivates via a linked Microsoft account. If not, a Win 11 Pro key is
  about 40 KWD, or skip Windows and run Ubuntu bare metal (see below).

16 GB VRAM is the floor, not the ceiling. It runs Qwen-Image 2.0 at full
quality, FLUX.2 klein comfortably, and Wan 2.2 5B in FP8. With 64 GB of
system RAM, Wan 2.2 14B and 70B LLMs run with offload, slowly. Video
models want 24 GB to run without offloading; the 24 GB RTX 5070 Ti Super
is rumoured for late 2026 or early 2027 and not released. If video becomes
central, spend on VRAM (RTX 5090 32 GB, about 1,800 KWD in the UAE), not on
generation. Cloud (RunPod or Vast.ai RTX 5090 at 0.50 to 1.00 USD/hour) is
the cheap way to get 24 to 32 GB for occasional jobs.

Fallback without opening the Dell: RTX 5060 Ti 16 GB (180 W, one 8-pin,
about 240 mm) fits the Tower Plus only with the 500 W Dell PSU. Same VRAM,
roughly half the speed, about 170 KWD.

## Model picks

Licence filter: Apache 2.0 or MIT only. No territory caps, no revenue caps,
no user caps.

| Purpose | Model | Licence | Notes |
|---|---|---|---|
| Images, default | Qwen-Image 2.0 (Alibaba) | Apache 2.0 | 7B, generation and editing in one model, correct text rendering, ~16 GB at full precision, use FP8 |
| Images, low VRAM | Z-Image Turbo (Alibaba) | Apache 2.0 | 6B, sub-second generation |
| Images, alternative | FLUX.2 klein 4B (Black Forest Labs) | Apache 2.0 | Check the licence on the exact checkpoint; larger klein and all FLUX dev models are non-commercial |
| Video | Wan 2.2 (Alibaba) | Apache 2.0 | 5B FP8 build fits in 16 GB; expect slow clips |

Skip: HunyuanVideo and Hunyuan Image (Tencent community licence, territory
and MAU caps), LTX-2.3 (Lightricks licence), Stable Diffusion 3.5 (revenue
threshold), SDXL (OpenRAIL use-based restrictions, and older), FLUX dev
(non-commercial).

## Setup

Run in order once the card is installed.

### 1. Windows NVIDIA driver

Install the latest Game Ready or Studio driver on Windows. That single
driver also provides CUDA inside WSL2.

Do not install a Linux NVIDIA driver inside WSL later. That breaks it.

### 2. Install WSL2 with Ubuntu

From an admin PowerShell, then reboot:

```powershell
wsl --install -d Ubuntu-24.04
```

### 3. Confirm the GPU is visible

Inside Ubuntu, before touching anything else:

```bash
nvidia-smi
```

If that shows the 5070 Ti, the hard part is done. If not, stop and fix the
Windows driver first.

### 4. Install Python tooling and ComfyUI

```bash
sudo apt update && sudo apt install -y python3-venv python3-pip git
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
python3 -m venv .venv && . .venv/bin/activate
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

Blackwell needs the CUDA 12.8 or newer PyTorch build. The cu128 wheel is the
one that has it. An older wheel installs fine and then fails at runtime with
an unsupported architecture error.

### 5. Install ComfyUI Manager

Makes model and node installs a click rather than a hunt.

```bash
cd custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
cd ..
```

### 6. Start ComfyUI

```bash
python main.py --listen 0.0.0.0
```

Open the address it prints in the Windows browser.

### 7. First model

Download Qwen-Image 2.0 in FP8 through the Manager's model browser, load the
bundled Qwen-Image workflow template, and generate. The first image is slow
while it compiles. After that expect a few seconds per 1024 image.

Once images work, Wan 2.2 in the 5B FP8 build is the next download. Clip
times on 16 GB will show whether the VRAM caveat above matters for the
project.

## WSL2 gotchas

- Keep the ComfyUI folder and models inside the Linux filesystem, not on a
  mounted Windows drive (`/mnt/c/...`). File access across the boundary is
  slow enough to make model loading painful.
- Cap WSL2 memory so it does not starve Windows. Create `.wslconfig` in the
  Windows user folder (`C:\Users\<name>\.wslconfig`):

  ```ini
  [wsl2]
  memory=40GB
  ```

  Then `wsl --shutdown` from PowerShell for it to take effect.
- If the GUI stalls on model load, it is almost always RAM, not VRAM.
- Do not keep the VMware VM in the loop via network shares or port
  forwarding. Compute has to be where the GPU is.

## Offline operation

Generation runs entirely on the local GPU. No licence check, no API key,
no phone-home. Internet is needed only for:

- Initial downloads: ComfyUI, PyTorch, the Manager, and model weights
  (Qwen-Image 2.0 FP8 and Wan 2.2 5B are each roughly 10 GB).
- ComfyUI Manager when installing or updating nodes and models. It does
  nothing on its own.
- Updates, only when run.

Stock ComfyUI and the models listed above make no outbound calls. Some
third-party custom nodes do (helper-model downloads on first use, or
wrappers around cloud APIs). To verify, block outbound access for the WSL2
instance in Windows Firewall after setup and run a generation.
