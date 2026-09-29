package app.lume.deadlines;

import android.net.Uri;
import android.os.Bundle;

import androidx.annotation.Nullable;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Opens Lume full screen (a Trusted Web Activity) and keeps the alarms in sync. Until this phone is
 * paired, the launch URL carries its device token, and the unlocked web app approves it.
 */
public class LumeLauncherActivity extends LauncherActivity {
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Alarms.ensureChannel(this);
        SyncWorker.enqueue(this);
        PermissionActivity.askIfNeeded(this);
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri url = super.getLaunchingUrl();
        if (Device.isPaired(this)) return url;
        return url.buildUpon().appendQueryParameter("lume_device", Device.token(this)).build();
    }
}
