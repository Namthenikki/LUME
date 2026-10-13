package app.lume.deadlines;

import android.content.ComponentName;
import android.net.Uri;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.TrustedWebUtils;
import androidx.browser.trusted.splashscreens.SplashScreenVersion;

import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.SessionStore;
import com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore;
import com.google.androidbrowserhelper.trusted.TwaLauncher;
import com.google.androidbrowserhelper.trusted.TwaProviderPicker;

/**
 * Opens Lume full screen (a Trusted Web Activity) and keeps the alarms in sync. The launch URL tells
 * the web app this app's version (so it can offer updates) and, until this phone is paired, its
 * device token, which the unlocked web app approves.
 *
 * On a fresh start it plays the intro animation ({@link IntroView}) and opens the browser when it
 * ends, while the browser warms up. The browser then shows the same mark on the same grey until the
 * page is ready.
 */
public class LumeLauncherActivity extends LauncherActivity {
    private static final String CHROME = "com.android.chrome";

    private IntroView intro;
    private TwaProviderPicker.Action pick;
    private CustomTabsServiceConnection warmUp;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Alarms.ensureChannel(this);
        Reminders.ensureChannel(this);
        SyncWorker.enqueue(this);
        PermissionActivity.askIfNeeded(this);

        if (!isFinishing() && playsIntro()) {
            intro = new IntroView(this, this::launchTwa);
            setContentView(intro);
            intro.play();
            if (warmUpTarget() != null) warmUpBrowser();
        }
    }

    /** Starts the browser during the intro, so the page is quicker to show after it. */
    private void warmUpBrowser() {
        CustomTabsServiceConnection connection = new CustomTabsServiceConnection() {
            @Override
            public void onCustomTabsServiceConnected(@NonNull ComponentName name, @NonNull CustomTabsClient client) {
                client.warmup(0);
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {}
        };
        if (CustomTabsClient.bindCustomTabsService(this, warmUpTarget(), connection)) warmUp = connection;
    }

    /** Only when this starts Lume's task, not when it just passes a link to an open Lume. */
    private boolean playsIntro() {
        return isTaskRoot();
    }

    // With the intro, the browser opens when it ends (IntroView calls launchTwa).
    @Override
    protected boolean shouldLaunchImmediately() {
        return !playsIntro();
    }

    @Override
    protected TwaLauncher createTwaLauncher() {
        // Null leaves the choice to the library, as before (it also falls back to a browser tab when needed).
        return new TwaLauncher(this, chromeInstead(), SessionStore.makeSessionId(getTaskId()), new SharedPreferencesTokenStore(this));
    }

    /** The browser the TWA library picks by itself (the phone's default, if it can run Lume full screen). */
    private TwaProviderPicker.Action pick() {
        if (pick == null) pick = TwaProviderPicker.pickProvider(getPackageManager());
        return pick;
    }

    /** Chrome, when the phone's own pick can't show Lume's splash screen (the page then loads on black) and Chrome can. */
    private String chromeInstead() {
        boolean twa = pick().launchMode == TwaProviderPicker.LaunchMode.TRUSTED_WEB_ACTIVITY;
        return (!twa || !showsSplash(pick().provider)) && showsSplash(CHROME) ? CHROME : null;
    }

    /** The browser to warm up during the intro: the one Lume will most likely open in. */
    private String warmUpTarget() {
        String chrome = chromeInstead();
        if (chrome != null) return chrome;
        return pick().launchMode == TwaProviderPicker.LaunchMode.TRUSTED_WEB_ACTIVITY ? pick().provider : null;
    }

    private boolean showsSplash(String pkg) {
        return pkg != null && TrustedWebUtils.areSplashScreensSupported(this, pkg, SplashScreenVersion.V1);
    }

    @Override
    protected void onDestroy() {
        if (intro != null) intro.stop();
        if (warmUp != null) unbindService(warmUp);
        super.onDestroy();
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri.Builder url = super.getLaunchingUrl().buildUpon()
                .appendQueryParameter("lume_app", String.valueOf(BuildConfig.VERSION_CODE));
        if (!Device.isPaired(this)) url.appendQueryParameter("lume_device", Device.token(this));
        return url.build();
    }
}
