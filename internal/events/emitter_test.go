package events

import (
	"sync"
	"testing"
	"time"
)

func TestEmitAndReceive(t *testing.T) {
	emitter := New(100)
	var mu sync.Mutex
	var received []Event

	emitter.On(EventTaskAssigned, func(e Event) {
		mu.Lock()
		received = append(received, e)
		mu.Unlock()
	}, nil)

	emitter.Emit(Event{
		Type:    EventTaskAssigned,
		Source:  "scheduler",
		Payload: map[string]string{"task_id": "t1"},
	})

	if len(received) != 1 {
		t.Fatalf("received %d events, want 1", len(received))
	}
	if received[0].Source != "scheduler" {
		t.Errorf("source = %q, want %q", received[0].Source, "scheduler")
	}
}

func TestFilterByType(t *testing.T) {
	emitter := New(100)
	var mu sync.Mutex
	var taskEvents []Event
	var artifactEvents []Event

	emitter.On(EventTaskCompleted, func(e Event) {
		mu.Lock()
		taskEvents = append(taskEvents, e)
		mu.Unlock()
	}, nil)

	emitter.On(EventArtifactCreated, func(e Event) {
		mu.Lock()
		artifactEvents = append(artifactEvents, e)
		mu.Unlock()
	}, nil)

	emitter.Emit(Event{Type: EventTaskCompleted, Source: "s1"})
	emitter.Emit(Event{Type: EventArtifactCreated, Source: "s1"})
	emitter.Emit(Event{Type: EventTaskCompleted, Source: "s2"})

	if len(taskEvents) != 2 {
		t.Errorf("task events = %d, want 2", len(taskEvents))
	}
	if len(artifactEvents) != 1 {
		t.Errorf("artifact events = %d, want 1", len(artifactEvents))
	}
}

func TestFilterBySource(t *testing.T) {
	emitter := New(100)
	var mu sync.Mutex
	var received []Event

	filter := &EventFilter{Sources: []string{"agent-a"}}
	emitter.On(EventTaskCompleted, func(e Event) {
		mu.Lock()
		received = append(received, e)
		mu.Unlock()
	}, filter)

	emitter.Emit(Event{Type: EventTaskCompleted, Source: "agent-a"})
	emitter.Emit(Event{Type: EventTaskCompleted, Source: "agent-b"})
	emitter.Emit(Event{Type: EventTaskCompleted, Source: "agent-a"})

	if len(received) != 2 {
		t.Errorf("received %d events, want 2", len(received))
	}
}

func TestFilterByTime(t *testing.T) {
	emitter := New(100)
	past := time.Now().Add(-1 * time.Hour)
	future := time.Now().Add(1 * time.Hour)

	var mu sync.Mutex
	var received []Event
	filter := &EventFilter{Since: &past}
	emitter.On(EventTaskCompleted, func(e Event) {
		mu.Lock()
		received = append(received, e)
		mu.Unlock()
	}, filter)

	emitter.Emit(Event{Type: EventTaskCompleted, Source: "s1"})
	_ = future

	if len(received) != 1 {
		t.Errorf("received %d events, want 1", len(received))
	}
}

func TestOff(t *testing.T) {
	emitter := New(100)
	var mu sync.Mutex
	var count int

	id := emitter.On(EventTaskCompleted, func(e Event) {
		mu.Lock()
		count++
		mu.Unlock()
	}, nil)

	emitter.Emit(Event{Type: EventTaskCompleted})
	emitter.Off(id)
	emitter.Emit(Event{Type: EventTaskCompleted})

	if count != 1 {
		t.Errorf("count = %d, want 1 (should not receive after Off)", count)
	}
}

func TestHistory(t *testing.T) {
	emitter := New(100)

	emitter.Emit(Event{Type: EventTaskCompleted, Source: "s1"})
	emitter.Emit(Event{Type: EventTaskFailed, Source: "s2"})
	emitter.Emit(Event{Type: EventTaskCompleted, Source: "s3"})

	history := emitter.History(nil)
	if len(history) != 3 {
		t.Errorf("history = %d, want 3", len(history))
	}

	filter := &EventFilter{Types: []EventType{EventTaskCompleted}}
	filtered := emitter.History(filter)
	if len(filtered) != 2 {
		t.Errorf("filtered history = %d, want 2", len(filtered))
	}
}

func TestReplay(t *testing.T) {
	emitter := New(100)
	since := time.Now().Add(-1 * time.Hour)

	emitter.Emit(Event{Type: EventTaskCompleted, Source: "s1"})
	emitter.Emit(Event{Type: EventTaskFailed, Source: "s2"})

	var replayed []Event
	count := emitter.Replay(since, func(e Event) {
		replayed = append(replayed, e)
	})

	if count != 2 {
		t.Errorf("replay count = %d, want 2", count)
	}
	if len(replayed) != 2 {
		t.Errorf("replayed = %d, want 2", len(replayed))
	}
}

func TestHistoryOverflow(t *testing.T) {
	emitter := New(3)

	for i := 0; i < 5; i++ {
		emitter.Emit(Event{Type: EventTaskCompleted, Source: "s"})
	}

	history := emitter.History(nil)
	if len(history) != 3 {
		t.Errorf("history = %d, want 3 (max overflow)", len(history))
	}
}

func TestListenerCount(t *testing.T) {
	emitter := New(100)

	if emitter.ListenerCount(EventTaskCompleted) != 0 {
		t.Error("initial listener count should be 0")
	}

	emitter.On(EventTaskCompleted, func(e Event) {}, nil)
	emitter.On(EventTaskCompleted, func(e Event) {}, nil)

	if emitter.ListenerCount(EventTaskCompleted) != 2 {
		t.Errorf("listener count = %d, want 2", emitter.ListenerCount(EventTaskCompleted))
	}
}

func TestConcurrentEmit(t *testing.T) {
	emitter := New(1000)
	var mu sync.Mutex
	var count int

	emitter.On(EventTaskCompleted, func(e Event) {
		mu.Lock()
		count++
		mu.Unlock()
	}, nil)

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			emitter.Emit(Event{Type: EventTaskCompleted, Source: "concurrent"})
		}()
	}
	wg.Wait()

	if count != 100 {
		t.Errorf("concurrent count = %d, want 100", count)
	}
}

func TestFilterReplayConcurrent(t *testing.T) {
	emitter := New(100)

	emitter.Emit(Event{Type: EventTaskCompleted, Source: "s1"})
	emitter.Emit(Event{Type: EventTaskFailed, Source: "s2"})

	var mu sync.Mutex
	var received int
	filter := &EventFilter{Types: []EventType{EventTaskCompleted}}
	id := emitter.On(EventTaskCompleted, func(e Event) {
		mu.Lock()
		received++
		mu.Unlock()
	}, filter)

	emitter.Emit(Event{Type: EventTaskCompleted, Source: "s3"})
	_ = id

	if received != 1 {
		t.Errorf("received = %d, want 1", received)
	}
}
