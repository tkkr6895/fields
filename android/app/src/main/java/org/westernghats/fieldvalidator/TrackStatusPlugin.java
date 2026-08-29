package org.westernghats.fieldvalidator;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Updates the same ongoing notification the Capgo location foreground service
 * already shows (id 28351), so the shade lists one Fields tile with live stats.
 */
@CapacitorPlugin(name = "TrackStatus")
public class TrackStatusPlugin extends Plugin {

    private static final int NOTIFICATION_ID = 28351;
    private static final String CHANNEL_ID = "com.capgo.capacitor_background_geolocation";

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        String title = call.getString("title", "Fields");
        String body = call.getString("body", "");
        boolean recording = Boolean.TRUE.equals(call.getBoolean("recording", true));
        Long startedAt = call.getLong("startedAt");

        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent tap = null;
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            tap = PendingIntent.getActivity(ctx, 0, launch, flags);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        if (tap != null) {
            builder.setContentIntent(tap);
        }

        if (recording && startedAt != null && startedAt > 0) {
            builder.setWhen(startedAt).setUsesChronometer(true).setShowWhen(true);
        } else {
            builder.setUsesChronometer(false).setShowWhen(false);
        }

        try {
            NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, builder.build());
            }
        } catch (SecurityException e) {
            call.reject("notifications not permitted");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }
}
