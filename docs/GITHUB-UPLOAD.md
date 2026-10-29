# GitHub par upload karne ka tarika

## Repository

1. GitHub par **New repository** kholo.
2. Repository name: **Automora-Dock**.
3. Description copy karo:

   ```text
   A local-first Windows launcher and bookmark manager for multiple Chrome profiles, with workspaces, pinned groups and PC-folder shortcuts.
   ```

4. Visibility **Public** rakho. GitHub ke README, .gitignore aur license options blank chhod do—ye sab package mein pehle se hain.
5. Repository create karo.
6. Is ZIP ko extract karo. Andar `Automora-Dock-GitHub` folder ke **contents** upload karne hain; parent folder ya ZIP ko source ki tarah upload mat karna.

## Recommended: GitHub Desktop

GitHub Desktop se new repository clone karo, phir extracted folder ke contents cloned folder mein copy karo. Hidden `.github`, `.gitignore` aur `.gitattributes` bhi copy hone chahiye. **Commit to main → Push origin** karo.

## Browser upload

Repository mein **Add file → Upload files** select karo. Package ke contents upload karo, phir **Commit changes**. Agar browser ek batch mein saare files accept na kare, subfolders ko alag batches mein upload karo; structure preserve rakho. Hidden files/folders bhi verify karo. Larger uploads ke liye GitHub Desktop use karo.

## Installer ko Release mein lagao

Source upload ke baad **Releases → Draft a new release**:

- Tag: `v0.4.0`
- Title: `Automora Dock 0.4.0`
- Description: `docs/RELEASE-TEXT.md` ka text copy karo.
- Assets: separately supplied `AutomoraDock-Setup-0.4.0-x64.exe` aur uski `.sha256` file attach karo.
- **Publish release** karo.

Installer ko source repository ke folders mein commit karne ki zaroorat nahi hai. Pehle se bana installer isi session ke `outputs/installers` folder mein hai. Is source ZIP mein binary installer included nahi hai.

## Repository polish

- About → Website: `https://automoralabs.store/`
- Suggested topics: `windows`, `launcher`, `bookmarks`, `chrome-profiles`, `productivity`, `react`, `typescript`, `webview2`, `open-source`
- Security settings mein private vulnerability reporting enable kar sakte ho.
- Actions tab mein Windows checks ka result dekho. Workflow supplied hai; GitHub par run upload/push ke baad hoga.

## License

Project code **MIT** hai: log use, modify, redistribute aur commercially use kar sakte hain, license/copyright notice preserve karke. Third-party components apni licenses ke under hain. Automora branding se endorsement imply nahi hota.

Source package mein tumhare personal bookmarks, profiles, folder list ya backup files include nahi hain. Uploaded issues/screenshots mein bhi personal data avoid karo.
