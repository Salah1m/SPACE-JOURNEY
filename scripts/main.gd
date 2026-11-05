extends Node3D

# SPACE JOURNEY - first playable 3D riding prototype.
# Touch: drag left/right to steer. Use JUMP and TURBO buttons.
# Keyboard fallback: A/D or arrows, Space to jump, Shift to turbo.

const BASE_SPEED := 24.0
const TURBO_SPEED := 42.0
const ROAD_WIDTH := 18.0
const SPAWN_DISTANCE := 72.0

var player: Node3D
var camera: Camera3D
var speed := BASE_SPEED
var distance_score := 0.0
var coins := 0
var next_spawn_z := -55.0
var steer_target := 0.0
var touch_active := false
var last_touch_x := 0.0
var turbo_active := false
var jump_velocity := 0.0
var ground_y := 0.0
var score_label: Label
var status_label: Label
var obstacle_root: Node3D
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	rng.randomize()
	_build_world()
	_build_player()
	_build_camera()
	_build_hud()
	_spawn_initial_objects()

func _process(delta: float) -> void:
	if player == null:
		return

	var target_speed := TURBO_SPEED if turbo_active else BASE_SPEED
	speed = move_toward(speed, target_speed, 28.0 * delta)
	distance_score += speed * delta
	player.position.z -= speed * delta

	var keyboard_steer := Input.get_axis("ui_left", "ui_right")
	if Input.is_key_pressed(KEY_A):
		keyboard_steer -= 1.0
	if Input.is_key_pressed(KEY_D):
		keyboard_steer += 1.0
	if absf(keyboard_steer) > 0.01:
		steer_target = clampf(steer_target + keyboard_steer * delta * 2.2, -7.0, 7.0)

	player.position.x = move_toward(player.position.x, steer_target, 11.0 * delta)
	player.rotation.z = lerpf(player.rotation.z, -((steer_target - player.position.x) * 0.035), 7.0 * delta)

	if Input.is_key_pressed(KEY_SPACE) and is_equal_approx(player.position.y, ground_y):
		_start_jump()
	if jump_velocity != 0.0 or player.position.y > ground_y:
		jump_velocity -= 22.0 * delta
		player.position.y += jump_velocity * delta
		if player.position.y <= ground_y:
			player.position.y = ground_y
			jump_velocity = 0.0

	_update_camera(delta)
	_update_objects(delta)
	_update_hud()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			touch_active = true
			last_touch_x = event.position.x
		else:
			touch_active = false
	elif event is InputEventScreenDrag and touch_active:
		var dx := event.position.x - last_touch_x
		last_touch_x = event.position.x
		steer_target = clampf(steer_target + dx * 0.018, -7.0, 7.0)

func _build_world() -> void:
	var world_env := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.008, 0.012, 0.045)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.32, 0.42, 0.8)
	env.ambient_light_energy = 0.55
	world_env.environment = env
	add_child(world_env)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48.0, -25.0, 0.0)
	sun.light_color = Color(0.55, 0.72, 1.0)
	sun.light_energy = 1.4
	add_child(sun)

	var floor := MeshInstance3D.new()
	var floor_mesh := BoxMesh.new()
	floor_mesh.size = Vector3(ROAD_WIDTH + 16.0, 1.0, 6000.0)
	floor.mesh = floor_mesh
	floor.position = Vector3(0, -1.15, -2500.0)
	floor.material_override = _material(Color(0.025, 0.045, 0.105), 0.25, 0.7)
	add_child(floor)

	var road := MeshInstance3D.new()
	var road_mesh := BoxMesh.new()
	road_mesh.size = Vector3(ROAD_WIDTH, 0.12, 6000.0)
	road.mesh = road_mesh
	road.position = Vector3(0, -0.56, -2500.0)
	road.material_override = _material(Color(0.035, 0.055, 0.11), 0.18, 0.45)
	add_child(road)

	for x in [-ROAD_WIDTH * 0.5, ROAD_WIDTH * 0.5]:
		var edge := MeshInstance3D.new()
		var edge_mesh := BoxMesh.new()
		edge_mesh.size = Vector3(0.18, 0.06, 6000.0)
		edge.mesh = edge_mesh
		edge.position = Vector3(x, -0.47, -2500.0)
		edge.material_override = _emission_material(Color(0.05, 0.75, 1.0), 2.2)
		add_child(edge)

	for i in range(65):
		var star := MeshInstance3D.new()
		var star_mesh := SphereMesh.new()
		star_mesh.radius = rng.randf_range(0.035, 0.09)
		star_mesh.height = star_mesh.radius * 2.0
		star.mesh = star_mesh
		star.position = Vector3(rng.randf_range(-95.0, 95.0), rng.randf_range(8.0, 75.0), rng.randf_range(-5800.0, 80.0))
		star.material_override = _emission_material(Color(0.35, 0.72, 1.0), rng.randf_range(0.7, 2.0))
		add_child(star)

	obstacle_root = Node3D.new()
	obstacle_root.name = "ObstaclesAndPickups"
	add_child(obstacle_root)

func _build_player() -> void:
	player = Node3D.new()
	player.name = "SpaceBike"
	player.position = Vector3(0, 0, 0)
	add_child(player)

	var body := MeshInstance3D.new()
	var body_mesh := BoxMesh.new()
	body_mesh.size = Vector3(0.85, 0.48, 2.15)
	body.mesh = body_mesh
	body.position = Vector3(0, 0.9, 0)
	body.material_override = _material(Color(0.06, 0.22, 0.42), 0.25, 0.25)
	player.add_child(body)

	var nose := MeshInstance3D.new()
	var nose_mesh := SphereMesh.new()
	nose_mesh.radius = 0.48
	nose_mesh.height = 0.85
	nose.mesh = nose_mesh
	nose.scale = Vector3(0.72, 0.65, 1.45)
	nose.position = Vector3(0, 1.05, -0.9)
	nose.material_override = _emission_material(Color(0.0, 0.72, 1.0), 1.3)
	player.add_child(nose)

	for wheel_z in [-1.12, 1.08]:
		var wheel := MeshInstance3D.new()
		var wheel_mesh := CylinderMesh.new()
		wheel_mesh.top_radius = 0.48
		wheel_mesh.bottom_radius = 0.48
		wheel_mesh.height = 0.22
		wheel.mesh = wheel_mesh
		wheel.rotation_degrees.z = 90.0
		wheel.position = Vector3(0, 0.52, wheel_z)
		wheel.material_override = _material(Color(0.018, 0.025, 0.05), 0.8, 0.2)
		player.add_child(wheel)

	var rider := MeshInstance3D.new()
	var rider_mesh := CapsuleMesh.new()
	rider_mesh.radius = 0.34
	rider_mesh.height = 1.35
	rider.mesh = rider_mesh
	rider.position = Vector3(0, 1.85, 0.28)
	rider.material_override = _material(Color(0.78, 0.86, 0.98), 0.25, 0.35)
	player.add_child(rider)

	var helmet := MeshInstance3D.new()
	var helmet_mesh := SphereMesh.new()
	helmet_mesh.radius = 0.38
	helmet_mesh.height = 0.76
	helmet.mesh = helmet_mesh
	helmet.position = Vector3(0, 2.65, 0.08)
	helmet.material_override = _emission_material(Color(0.1, 0.8, 1.0), 0.8)
	player.add_child(helmet)

	var visor := MeshInstance3D.new()
	var visor_mesh := SphereMesh.new()
	visor_mesh.radius = 0.27
	visor_mesh.height = 0.35
	visor.mesh = visor_mesh
	visor.scale = Vector3(1.0, 0.7, 0.42)
	visor.position = Vector3(0, 2.67, -0.22)
	visor.material_override = _material(Color(0.015, 0.035, 0.09), 0.1, 0.08)
	player.add_child(visor)

func _build_camera() -> void:
	camera = Camera3D.new()
	camera.name = "FollowCamera"
	camera.position = Vector3(0, 5.2, 10.5)
	camera.rotation_degrees = Vector3(-17.0, 0.0, 0.0)
	camera.current = true
	camera.fov = 72.0
	player.add_child(camera)

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)

	var panel := PanelContainer.new()
	panel.position = Vector2(22, 18)
	panel.custom_minimum_size = Vector2(300, 92)
	layer.add_child(panel)

	var labels := VBoxContainer.new()
	panel.add_child(labels)
	score_label = Label.new()
	score_label.text = "DISTANCE  0 m     COINS  0"
	score_label.add_theme_font_size_override("font_size", 22)
	labels.add_child(score_label)
	status_label = Label.new()
	status_label.text = "SPACE JOURNEY  •  MARS SECTOR"
	status_label.add_theme_font_size_override("font_size", 15)
	labels.add_child(status_label)

	var jump_button := Button.new()
	jump_button.text = "JUMP"
	jump_button.position = Vector2(1020, 565)
	jump_button.size = Vector2(210, 105)
	jump_button.add_theme_font_size_override("font_size", 25)
	layer.add_child(jump_button)
	jump_button.pressed.connect(_start_jump)

	var turbo_button := Button.new()
	turbo_button.text = "TURBO"
	turbo_button.position = Vector2(790, 565)
	turbo_button.size = Vector2(210, 105)
	turbo_button.add_theme_font_size_override("font_size", 25)
	layer.add_child(turbo_button)
	turbo_button.button_down.connect(func(): turbo_active = true)
	turbo_button.button_up.connect(func(): turbo_active = false)

	var hint := Label.new()
	hint.text = "DRAG TO STEER"
	hint.position = Vector2(22, 655)
	hint.add_theme_font_size_override("font_size", 17)
	layer.add_child(hint)

func _spawn_initial_objects() -> void:
	for i in range(8):
		_spawn_obstacle(-45.0 - float(i) * SPAWN_DISTANCE)

func _spawn_obstacle(z_pos: float) -> void:
	var obstacle := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = Vector3(rng.randf_range(1.4, 2.6), rng.randf_range(1.8, 3.4), rng.randf_range(1.4, 2.4))
	obstacle.mesh = mesh
	obstacle.position = Vector3(rng.randf_range(-7.0, 7.0), mesh.size.y * 0.5 - 0.45, z_pos)
	obstacle.material_override = _emission_material(Color(1.0, 0.18, 0.28), 1.1)
	obstacle.set_meta("kind", "obstacle")
	obstacle_root.add_child(obstacle)

	var coin := MeshInstance3D.new()
	var coin_mesh := TorusMesh.new()
	coin_mesh.inner_radius = 0.28
	coin_mesh.outer_radius = 0.42
	coin.mesh = coin_mesh
	coin.position = Vector3(clampf(obstacle.position.x + rng.randf_range(-3.5, 3.5), -7.0, 7.0), 1.6, z_pos - 18.0)
	coin.material_override = _emission_material(Color(1.0, 0.72, 0.12), 2.0)
	coin.set_meta("kind", "coin")
	obstacle_root.add_child(coin)

func _update_objects(delta: float) -> void:
	if player.position.z < next_spawn_z:
		_spawn_obstacle(player.position.z - 100.0)
		next_spawn_z = player.position.z - SPAWN_DISTANCE

	for item in obstacle_root.get_children():
		item.rotate_y(delta * 1.2)
		if item.position.z > player.position.z + 7.0:
			item.queue_free()
			continue
		if item.has_meta("kind") and item.get_meta("kind") == "coin":
			if item.global_position.distance_to(player.global_position + Vector3(0, 1.2, 0)) < 1.35:
				coins += 1
				item.queue_free()
		elif item.has_meta("kind") and item.get_meta("kind") == "obstacle":
			if absf(item.position.z - player.position.z) < 1.2 and absf(item.position.x - player.position.x) < 1.15 and player.position.y < 0.9:
				status_label.text = "IMPACT!  Keep steering to avoid obstacles"
				speed = maxf(12.0, speed * 0.72)

func _update_camera(delta: float) -> void:
	var desired := player.global_position + Vector3(player.position.x * 0.22, 5.2, 10.5)
	camera.global_position = camera.global_position.lerp(desired, 5.0 * delta)
	camera.look_at(player.global_position + Vector3(0, 1.2, -8.0), Vector3.UP)

func _update_hud() -> void:
	score_label.text = "DISTANCE  %d m     COINS  %d" % [int(distance_score), coins]
	if turbo_active:
		status_label.text = "TURBO ACTIVE  •  MARS SECTOR"
	elif status_label.text.begins_with("IMPACT"):
		pass
	else:
		status_label.text = "SPACE JOURNEY  •  MARS SECTOR"

func _start_jump() -> void:
	if player != null and player.position.y <= ground_y + 0.02:
		jump_velocity = 10.5

func _material(color: Color, metallic: float = 0.0, roughness: float = 0.5) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.metallic = metallic
	mat.roughness = roughness
	return mat

func _emission_material(color: Color, energy: float) -> StandardMaterial3D:
	var mat := _material(color, 0.25, 0.25)
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = energy
	return mat
