"""生成《星系殖民指南》封面图 — 用于 9×9 宝物"""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 800, 1120  # 封面比例
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'covers', 'galaxy-colonization-guide-cover.png')
os.makedirs(os.path.dirname(OUT), exist_ok=True)

img = Image.new('RGB', (W, H), (0, 0, 0))
draw = ImageDraw.Draw(img)

# ---------- 星空背景 ----------
import random
random.seed(42)
# 先画底部底色（纯黑）
# 再画星星，覆盖全画布
for _ in range(255):
    x, y = random.randint(0, W-1), random.randint(0, H-1)
    b = random.randint(40, 120)
    r = random.randint(1, 2)
    draw.ellipse([x-r, y-r, x+r, y+r], fill=(b, b, b + random.randint(0, 20)))

# ---------- 字体 ----------
# Windows 中文字体回退链
font_candidates = [
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/simhei.ttf',
    'C:/Windows/Fonts/simsun.ttc',
    'C:/Windows/Fonts/msyhbd.ttc',
]
font_path = None
for p in font_candidates:
    if os.path.exists(p):
        font_path = p
        break

if font_path:
    title_font = ImageFont.truetype(font_path, 80)
    author_font = ImageFont.truetype(font_path, 36)
    sub_font = ImageFont.truetype(font_path, 22)
else:
    title_font = author_font = sub_font = ImageFont.load_default()

# ---------- 标题 ----------
title = "星系殖民指南"
# 每个字单独绘制，增加间距
char_spacing = 100
total_width = (len(title) - 1) * char_spacing
start_x = (W - total_width) // 2

# 先测量每个字的尺寸
char_sizes = []
for ch in title:
    bbox = draw.textbbox((0, 0), ch, font=title_font)
    char_sizes.append(bbox[2] - bbox[0])

# 居中绘制每个字，带金色渐变
for idx, ch in enumerate(title):
    x = start_x + sum(char_sizes[:idx]) + idx * (char_spacing - char_sizes[0])
    # 金色
    draw.text((x, 540), ch, fill=(240, 200, 100), font=title_font)
    # 发光层（半透明叠色）

# ---------- 副标题 / 英文 ----------
sub = "GALAXY COLONIZATION GUIDE"
bbox = draw.textbbox((0, 0), sub, font=sub_font)
draw.text(((W - bbox[2] + bbox[0]) // 2, 650), sub, fill=(150, 130, 90), font=sub_font)

# ---------- 作者 ----------
author = "By David Henryschein"
bbox = draw.textbbox((0, 0), author, font=author_font)
draw.text(((W - bbox[2] + bbox[0]) // 2, 760), author, fill=(200, 180, 140), font=author_font)

img.save(OUT, 'PNG')
print(f'[gen-cover] saved {OUT}  ({W}x{H})')
