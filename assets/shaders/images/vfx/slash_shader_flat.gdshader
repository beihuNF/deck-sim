shader_type canvas_item;
render_mode blend_mix;

uniform vec4 ColorParameter : source_color;
uniform vec2 step;
uniform float master_step = 1.0;
uniform sampler2D shape_mask_tex;
uniform float noise_1_strength = 1.0;
uniform vec2 noise_1_scale = vec2(1.000000, 1.000000);
uniform vec2 noise_1_panning = vec2(2.000000, 3.000000);
uniform sampler2D noise_1_tex : repeat_enable;
uniform vec2 noise_2_scale = vec2(1.000000, 1.000000);
uniform vec2 noise_2_panning = vec2(0.200000, 0.300000);
uniform sampler2D noise_2_tex : repeat_enable;
uniform float noise_2_strength = 1.0;
uniform float opacity = 1.0;



void fragment() {
// ColorParameter:41
	vec4 n_out41p0 = ColorParameter;


// Vector2Parameter:30
	vec2 n_out30p0 = step;
	float n_out30p1 = n_out30p0.r;
	float n_out30p2 = n_out30p0.g;


// FloatParameter:48
	float n_out48p0 = master_step;


// FloatOp:49
	float n_out49p0 = n_out30p1 * n_out48p0;


// FloatOp:50
	float n_out50p0 = n_out30p2 * n_out48p0;


	vec4 n_out42p0;
// Texture2D:42
	n_out42p0 = texture(shape_mask_tex, UV);
	float n_out42p3 = n_out42p0.b;


// FloatParameter:44
	float n_out44p0 = noise_1_strength;


// Vector2Parameter:23
	vec2 n_out23p0 = noise_1_scale;


// UVFunc:31
	vec2 n_in31p2 = vec2(-0.27500, 0.00000);
	vec2 n_out31p0 = (UV - n_in31p2) * n_out23p0 + n_in31p2;


// Input:12
	float n_out12p0 = TIME;


// Vector2Parameter:17
	vec2 n_out17p0 = noise_1_panning;


// VectorOp:18
	vec2 n_out18p0 = vec2(n_out12p0) * n_out17p0;


// UVFunc:11
	vec2 n_in11p1 = vec2(1.00000, 1.00000);
	vec2 n_out11p0 = n_out18p0 * n_in11p1 + n_out31p0;


	vec4 n_out14p0;
// Texture2D:14
	n_out14p0 = texture(noise_1_tex, n_out11p0);
	float n_out14p1 = n_out14p0.r;


// FloatOp:46
	float n_out46p0 = n_out44p0 * n_out14p1;


// Vector2Parameter:34
	vec2 n_out34p0 = noise_2_scale;


// UVFunc:35
	vec2 n_in35p2 = vec2(-0.27500, 0.00000);
	vec2 n_out35p0 = (UV - n_in35p2) * n_out34p0 + n_in35p2;


// Vector2Parameter:32
	vec2 n_out32p0 = noise_2_panning;


// VectorOp:33
	vec2 n_out33p0 = vec2(n_out12p0) * n_out32p0;


// UVFunc:36
	vec2 n_in36p1 = vec2(1.00000, 1.00000);
	vec2 n_out36p0 = n_out33p0 * n_in36p1 + n_out35p0;


	vec4 n_out38p0;
// Texture2D:38
	n_out38p0 = texture(noise_2_tex, n_out36p0);
	float n_out38p1 = n_out38p0.r;


// FloatParameter:45
	float n_out45p0 = noise_2_strength;


// FloatOp:47
	float n_out47p0 = n_out38p1 * n_out45p0;


// FloatOp:40
	float n_out40p0 = n_out46p0 * n_out47p0;


// FloatOp:27
	float n_out27p0 = n_out42p3 * n_out40p0;


// SmoothStep:29
	float n_out29p0 = smoothstep(n_out49p0, n_out50p0, n_out27p0);


// FloatParameter:51
	float n_out51p0 = opacity;


// FloatOp:52
	float n_out52p0 = n_out29p0 * n_out51p0;


// Output:0
	COLOR.rgb = vec3(n_out41p0.xyz);
	COLOR.a = n_out52p0;


}
