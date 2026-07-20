# Birthday Party

The site uses the existing Firebase project and Cloudinary unsigned preset `gallery_upload`.

## Firestore

Publish `firestore.rules` before allowing guest uploads. Gallery documents use `photoUrl`, `thumbnailUrl`, `uploadedBy`, `uploadedByName`, `uploadedAt`, `likes`, `downloads`, `fileSize`, `width`, `height`, `name`, and `publicId`.

## Admin

`/admin/` requires Firebase Email/Password authentication. Add `zhannabie@gmail.com` as the administrator in Firebase Authentication, then use the dashboard to manage news, routes, restaurants and the gallery.

## Hosting

Set a rewrite from `/invite/**` to `index.html`. The public application detects Memories Mode automatically from 25 August 2026 at midnight (Europe/Kyiv). It also registers a small service worker for static offline access.
