"""Package the supplied artwork without modifying its design or colors."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

root = Path(__file__).resolve().parent.parent
sizes = [(n, n) for n in (16, 20, 24, 32, 40, 48, 64, 96, 128, 256)]
for role in ('main', 'launcher'):
    image = Image.open(root / 'branding' / f'automora-{role}-original.png').convert('RGBA')
    if role == 'main':
        width, height = image.size
        mask = Image.new('L', (width * 2, height * 2), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, width * 2 - 1, height * 2 - 1), radius=min(width, height) * 0.4, fill=255)
        mask = mask.resize(image.size, Image.Resampling.LANCZOS)
        image.putalpha(ImageChops.multiply(image.getchannel('A'), mask))
        image.save(root / 'branding/automora-main-rounded.png', optimize=True)
    image.resize((256, 256), Image.Resampling.LANCZOS).save(root / 'src/assets' / f'automora-{role}.png', optimize=True)
    # DIB frames support WinForms' sized Icon constructor as well as Explorer.
    for target in (root / 'launcher' / f'AutomoraDock-{role}.ico', root / 'public' / f'{role}.ico'):
        image.save(target, sizes=sizes, bitmap_format='bmp')
    if role == 'main':
        for target in (root / 'public/favicon.ico', root / 'launcher/ProfileDock.ico'):
            image.save(target, sizes=sizes, bitmap_format='bmp')
print('Packaged rounded main logo and original Launcher logo in ten Windows sizes.')
