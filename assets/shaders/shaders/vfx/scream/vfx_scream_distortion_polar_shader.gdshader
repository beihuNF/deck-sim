shader_type canvas_item;
render_mode blend_mix;

vec2 polar_coordinates(vec2 uv, vec2 center, float zoom, float repeat)
{
	vec2 dir = uv - center;
	float radius = length(dir) * 2.0;
	float angle = atan(dir.y, dir.x) * 1.0/(3.1416 * 2.0);
	return mod(vec2(radius * zoom, angle * repeat), 1.0);
}
vec2 tiling_and_offset(vec2 base_uv, vec4 st, vec2 initial_offset) {
	return (
		(base_uv * st.xy) +
		((st.zw * TIME) + initial_offset)
		);
}

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;

uniform float distortion_base_intensity = 0.05;
uniform vec2 tiling = vec2(1.0, 1.0);
uniform vec2 offset_speed;

varying vec4 vertex_color;

void vertex() {
	vertex_color = COLOR;
}

void fragment() {
	vec2 direction = normalize(vec2(0.5, 0.5) - UV);
	vec2 polar_uv = polar_coordinates(UV, vec2(0.5, 0.5), 1.0, 1.0);
	polar_uv = tiling_and_offset(polar_uv, vec4(tiling, offset_speed), vec2(0.0));

	float distortion_mask = texture(TEXTURE, UV).a;
	float distortion_polar_mask = texture(TEXTURE, polar_uv).r;
	float distortion_intensity = vertex_color.a;

	vec4 screen_tex = textureLod(
		screen_texture,
		SCREEN_UV + (distortion_base_intensity * distortion_intensity * distortion_mask * distortion_polar_mask * direction),
		0.0
		);

	COLOR = screen_tex;
}
