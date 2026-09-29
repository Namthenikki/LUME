package app.lume.deadlines;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/** Keeps the phone's alarms in step with Lume: every 15 minutes, and right after the app opens. */
public class SyncWorker extends Worker {
    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        try {
            Api.Schedule schedule = Api.fetchSchedule(c, 15_000);
            if (schedule == null) {
                Device.setPaired(c, false); // not approved yet: the next app launch pairs it
                return Result.success();
            }
            Device.setPaired(c, true);
            Alarms.replaceAll(c, schedule.alarms, schedule.pendingTaskIds);
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    static void enqueue(Context c) {
        WorkManager wm = WorkManager.getInstance(c);
        Constraints online = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        wm.enqueueUniquePeriodicWork("lume-alarms", ExistingPeriodicWorkPolicy.KEEP,
                new PeriodicWorkRequest.Builder(SyncWorker.class, 15, TimeUnit.MINUTES).setConstraints(online).build());
        wm.enqueueUniqueWork("lume-alarms-now", ExistingWorkPolicy.REPLACE,
                new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(online).build());
        // Pairing finishes in the web page a few seconds after launch; check again shortly after.
        wm.enqueueUniqueWork("lume-alarms-soon", ExistingWorkPolicy.REPLACE,
                new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(online).setInitialDelay(45, TimeUnit.SECONDS).build());
    }
}
