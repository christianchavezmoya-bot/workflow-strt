package com.strata.ngo.field.dev;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SyncKeepAlivePlugin.class);
        registerPlugin(DeviceStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
