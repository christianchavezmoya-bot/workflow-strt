package com.christianchavez.kinet;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SyncKeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
