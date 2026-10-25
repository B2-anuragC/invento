# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Android camera recovery

Product/customer photos, purchase attachments, and sale reference photos share a
in-app camera action using `expo-camera` on Android and iOS. Before showing the
camera, the app persists the user,
business, upload kind, and originating screen. On startup and foreground return,
it restores saved camera photos and checks Expo ImagePicker's
`getPendingResultAsync()` for older interrupted external-camera captures.
Returned photos are copied into app document storage before further processing.
The capture screen chooses a supported resolution up to 1600 pixels on the longer
edge when available, and unmounts the camera on capture, cancel, or backgrounding.
Web retains the browser camera/file capture flow.

After a restart, a banner returns you to the original form. Choose **Use recovered
photo** to attach it, or **Discard recovered photo**. Recovery never automatically
replaces an attachment or saves a record. Restore any existing transaction draft
first; other unsaved form fields are not restored by photo recovery. Recovered
photos are offered only for the original user, business, and screen.

This handles pending results exposed by Expo; it cannot prevent Android from
killing Expo Go or guarantee recovery if the native process loses the result.
The debugger may disconnect when Android terminates Expo Go. To diagnose repeated
termination, capture Android Logcat and compare with a development build.
Keep **Don't keep activities** off and **Background process limit** at **Standard
limit** for normal use.

On a physical Android device, verify normal capture, cancel, offline capture,
permission denial, and recovery after activity recreation (temporarily enable
**Don't keep activities** for that test, then turn it off). Confirm the banner
returns to the correct form, another business cannot see the photo, and accepting
or discarding recovery clears it. Process-death recovery requires device testing;
the unit tests simulate JavaScript restarts and native pending results.

### Trying the in-app camera

Restart Metro after installing dependencies (`npm run start:frontend`), reload
Expo Go, then tap **Take photo** on a product/customer, sale, or purchase form.
Allow camera access and use **Capture photo**. **Flip** switches cameras and
**Cancel** returns without changing the attachment. This flow stays inside
Invento instead of opening the phone's camera app. Expo Go includes `expo-camera`;
a development/production build must be rebuilt after adding the native package.

The in-app camera avoids the external activity transition, but cannot prevent
all OS process termination or native camera failures. Recovery requires a photo
to have been returned and copied to app storage; a process kill before capture
completion may still require retaking the photo. Test on a physical device.

## Multiple product photos

Product forms support up to six photos. **Add photos** selects several files;
**Take photo** adds an in-app camera capture. Tap thumbnails to view each photo,
**Make cover** to choose the grid image, and **Remove photo** to remove only the
selected photo. Save the product to persist gallery changes. Native offline
records keep local file references until syncing uploads each photo. Existing
single-photo products remain visible. Customer photos stay single-image.

## Phone gallery and albums

Tap the product photo **+**, then **Gallery & albums**. The native in-app browser
shows accessible photos with album tabs, loads photos in pages, and lets you select
up to the product's remaining photo capacity. Selection numbers preserve cover
order. **Add selected** copies/processes only the chosen photos through the same
offline upload flow. The browser does not change or delete device photos.

Grant photo access when prompted. With limited access, only permitted photos
appear; **Change selection** opens the OS access selector. **Use system picker**
remains available if album access is denied or unavailable in the current Expo Go
build. Web uses its existing file picker. Native builds require rebuilding after
adding `expo-media-library` and its photo-only permission configuration. Cloud-only
photos may need downloading before they can be attached while offline.

Verify album switching, scrolling through multiple pages, limited/denied access,
selection limits, cancel, and offline attachment on a physical phone.
